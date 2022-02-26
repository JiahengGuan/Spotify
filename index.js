const url = require("url");
const fs = require('fs');
const http = require('http');
const https = require('https');
const port = 3000;
const server = http.createServer();
const {client_id,client_secret} = require('./auth/credentials.json');


server.on("request", connection_handler);
function connection_handler(req, res){
	console.log(`New Request for ${req.url} from ${req.socket.remoteAddress}`);
	if(req.url === "/"){
		const main = fs.createReadStream('html/main.html');
		res.writeHead(200,{'Content-Type':'text/html'});
	    main.pipe(res);
    }
	else if(req.url === "/favicon.ico"){
		const favicon = fs.createReadStream('images/favicon.ico');
		res.writeHead(200,{'Content-Type':'image/x-icon'})
		favicon.pipe(res);
	}
	else if(req.url === "/images/banner.jpg"){
		const banner = fs.createReadStream('images/banner.jpg');
		res.writeHead(200,{'Content-Type':'image/jpeg'});
		banner.pipe(res);
	}
	else if(req.url.startsWith("/search")){
		const myURL = new URL(req.url, "http://localhost:3000");
		const artist = myURL.searchParams.get("artist");
		const token_cache_file = './auth/authentication-res.json';
		let cache_valid = false;
		
		if(fs.existsSync(token_cache_file)){
			cache_token_object = require(token_cache_file);
			if(new Date(cache_token_object.expiration) > Date.now()){
				cache_valid = true;
			}
		}
		if(cache_valid){
			let access_token = cache_token_object.access_token;
			console.log("Cache exists and is valid");
			create_search_request(access_token, artist, res);
		}
		else{
			request_access_token(artist, res);
		}
	}
	else if(req.url.startsWith("/album-art/")){
		const image_stream = fs.createReadStream(`.${req.url}`);
	    image_stream.on('error',image_error_handler);
	    function image_error_handler(err){
			res.writeHead(404,{"Content-Type":"text/plain"});
		    res.end("404 not Found");
	    }
	    image_stream.on('ready',deliver_image);
	    function deliver_image(){
		    res.writeHead(200, {"Content-Type":"image/jpeg"});
		    image_stream.pipe(res);
	    }
	}
	else{
		res.writeHead(404,{"Content-Type":"text/plain"});
		res.end("404 not Found");
	}

}

function stream_to_message(stream, callback, ...args){
	let body = "";
	stream.on("data", (chunk) => body += chunk);
	stream.on("end", ()=> callback(body, ...args));
}

function request_access_token(artist, res){
	const {client_id,client_secret} = require('./auth/credentials.json');
	let base64data = Buffer.from(`${client_id}:${client_secret}`).toString('base64');
	const options = {
		method:"POST",
		headers : {
			"Content-Type":`application/x-www-form-urlencoded`,
			"Authorization":`Basic ${base64data}`
		}
	};
	const post_data = require('querystring').stringify({grant_type : "client_credentials"});
	const token_endpoint = "https://accounts.spotify.com/api/token";
	const token_request_time = new Date();
	const token_request = https.request(token_endpoint, options);
	token_request.once("error", err => {throw err});
	token_request.once("response", (token_stream) => stream_to_message(token_stream, recived_token, artist,token_request_time , res));
	token_request.end(post_data);
}

function recived_token(serialzied_token_object, artist,token_request_time, res){
	console.log(`token: ${serialzied_token_object}`);
	let token_object = JSON.parse(serialzied_token_object);
	let access_token = token_object.access_token;
	create_access_token_cache(token_object, token_request_time);
    create_search_request(access_token, artist, res);
}

function create_access_token_cache(token_object, token_request_time){
	token_object.expiration = new Date(token_request_time.getTime() + (token_object.expires_in * 1000));
	fs.writeFile('./auth/authentication-res.json', JSON.stringify(token_object), () => console.log("Access Token Cache"));
}

function create_search_request(access_token, artist, res){
	const options = {
		method:"GET",
		headers:{
			"Authorization":`Bearer ${access_token}`
		}
	};
	const search_query = require('querystring').stringify({type:"album", q:artist});
	const search_endpoint = `https://api.spotify.com/v1/search?${search_query}`;
	const search_request = https.request(search_endpoint, options);
	search_request.once("error", err => {throw err});
	search_request.once("response", (search_result_stream) => stream_to_message(search_result_stream, recived_search_result,artist, res));
	search_request.end();
}

function recived_search_result(search_object,artist, res){
	const search_results = JSON.parse(search_object);
	const albums = search_results.albums.items;
	const album_art_url = albums.map(album => album.images[1].url);
	/*
	let album_art_url = [];
	for(let i = 0; i< albums.length; i++){
		album_art_url.push(album.images[1].url);
	}
	*/ 
	const downloaded_images = {images:[], total:album_art_url.length};
	album_art_url.map(url => download_image(url, downloaded_images,artist, res));
}

function download_image(url, downloaded_images, artist, res){
	let tokenized_url = url.split("/");
	let filename = tokenized_url[tokenized_url.length-1];
	const image_path = `album-art/${filename}.jpg`;
	const image_request = https.get(url);
	image_request.on("response", function receive_image_data(image_stream){
		const saved_image = fs.createWriteStream(image_path, {encoding:null});
		image_stream.pipe(saved_image);
		saved_image.on("finish",function(){
			downloaded_images.images.push(image_path);
			if(downloaded_images.images.length >= downloaded_images.total){
				generate_webpage(downloaded_images.images,artist,res);
			}			
		})
	})
}

function generate_webpage(image_urls,artist, res){	
	let image_componment = image_urls.map(image_url => `<img src = "${image_url}" />`).join("");
    res.writeHead(404,{"Content-Type":"text/html"});
	res.end(`<h1>${artist}</h1> ${image_componment}`);
}

server.on("listening", listening_handler);
function listening_handler(){
	console.log(`Now Listening on Port ${port}`);
}

server.listen(port);
