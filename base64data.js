const client_id = "9ddd5ed4892746939f305b263b7dc556";
const client_secret = "93f05e1c81534689828fbd97d26c779c";
let base64data = Buffer.from(`${client_id}:${client_secret}`).toString('base64');
console.log(`Basic ${base64data}`);