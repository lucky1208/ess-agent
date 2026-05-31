import { defineConfig } from 'vite'
import { resolve } from 'path'
import { cpSync, readdirSync, copyFileSync, mkdirSync, existsSync } from 'fs'

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        arch: resolve(__dirname, '系统架构图_v11_10kV.html'),
        wiring: resolve(__dirname, '电气接线图_v11_10kV.html'),
      }
    }
  },
  publicDir: false,
  plugins:[{
    name:'copy-assets',
    closeBundle(){
      cpSync(resolve(__dirname,'images'),resolve(__dirname,'dist/images'),{recursive:true})
      const svgDir=__dirname;
      const svgFiles=readdirSync(svgDir).filter(f=>f.endsWith('.svg'));
      svgFiles.forEach(f=>{
        copyFileSync(resolve(svgDir,f),resolve(__dirname,'dist',f));
      });
      const htmlFiles=['ess_agent_3d_twin_viewer.html'];
      htmlFiles.forEach(f=>{
        const src=resolve(__dirname,f);
        if(existsSync(src)) copyFileSync(src,resolve(__dirname,'dist',f));
      });
    }
  }]
})
