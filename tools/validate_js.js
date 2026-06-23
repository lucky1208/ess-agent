import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const blocks=[];
let s=0;
while(true){
  const i=html.indexOf('<script>',s);
  if(i<0)break;
  const e=html.indexOf('</script>',i);
  if(e<0)break;
  blocks.push(html.substring(i+8,e));
  s=e+9;
}
console.log('Found '+blocks.length+' script blocks');
let ok=true;
blocks.forEach((code,i)=>{
  try{new Function(code);}
  catch(err){console.log('Block '+(i+1)+' ERROR: '+err.message.slice(0,200));ok=false;}
});
if(ok)console.log('All '+blocks.length+' script blocks OK');