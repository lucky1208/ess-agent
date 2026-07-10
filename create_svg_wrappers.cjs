const fs = require('fs');
const path = require('path');

const pngs = [
  { src: '闪充 系统架构图.png', out: 'flash-arch.svg', alt: '闪充系统架构图' },
  { src: '闪充主功率原理图.png', out: 'flash-power.svg', alt: '闪充主功率原理图' },
  { src: 'yelengxitong.png', out: 'flash-cooling.svg', alt: '闪充站冷却系统图' },
  { src: 'gaoyapeidian.png', out: 'gaoyapeidian.svg', alt: '高压配电系统' },
  { src: 'gonglvdiaodu.png', out: 'gonglvdiaodu.svg', alt: '功率调度系统' },
  { src: 'BMS&protocol.png', out: 'bms-protocol.svg', alt: 'BMS与充电协议' },
  { src: 'battery design.png', out: 'battery-design.svg', alt: '电池系统设计' },
  { src: 'reguanli.png', out: 'thermal.svg', alt: '热管理系统' },
];

function getPngDimensions(buffer) {
  if (buffer.length < 24) return {width: 900, height: 600};
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4E || buffer[3] !== 0x47) {
    return {width: 900, height: 600};
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return {width, height};
}

pngs.forEach(p => {
  let srcPath = path.join(__dirname, p.src);
  if (!fs.existsSync(srcPath)) {
    const alt = path.join(__dirname, 'images', path.basename(p.src));
    if (fs.existsSync(alt)) srcPath = alt;
    else {
      console.log('MISSING:', p.src);
      return;
    }
  }
  const buf = fs.readFileSync(srcPath);
  const dims = getPngDimensions(buf);
  const b64 = buf.toString('base64');
  const mime = 'image/png';
  
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${dims.width}" height="${dims.height}" 
     viewBox="0 0 ${dims.width} ${dims.height}" 
     preserveAspectRatio="xMidYMid meet">
  <title>${p.alt}</title>
  <image width="100%" height="100%" xlink:href="data:${mime};base64,${b64}" />
</svg>`;
  
  const outPath = path.join(__dirname, p.out);
  fs.writeFileSync(outPath, svg);
  console.log(`Created ${p.out} (${dims.width}x${dims.height}, ${(buf.length/1024).toFixed(1)}KB -> ${(svg.length/1024).toFixed(1)}KB)`);
});