import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('dist');
const port = Number(process.env.PORT ?? 4173);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2','.svg':'image/svg+xml'};
if (!fs.existsSync(path.join(root,'index.html'))) throw new Error('Run npm run build first.');
http.createServer((req,res)=>{
  let file;
  try {
    const url = new URL(req.url,'http://localhost');
    file = path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if (file !== root && !file.startsWith(root+path.sep)) throw new Error('invalid path');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file,'index.html');
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('الصفحة غير موجودة');
    return;
  }
  res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream'});
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(file).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(`http://127.0.0.1:${port}`));
