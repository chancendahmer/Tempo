// QA-only contact sheet: approved visual reference and rendered candidate, equal scale.
const sharp = require('sharp');
const path = require('node:path');
(async () => {
  const reference = 'C:/Users/chanc/.codex/generated_images/01a0e888-486c-7fa1-87a1-300fe9b3f4b2/exec-f94369be-f176-4cda-90fa-278606c52d6c.png';
  const images = await Promise.all([reference, path.join(__dirname, 'morning-desktop.png')].map(file => sharp(file).resize(1000, 720, { fit: 'contain', background: '#ffffff' }).toBuffer()));
  const label = Buffer.from('<svg width="2000" height="50"><rect width="2000" height="50" fill="#ffffff"/><text x="25" y="32" font-size="24" font-family="Arial" fill="#172324">Approved concept</text><text x="1025" y="32" font-size="24" font-family="Arial" fill="#172324">Implemented Home — fictional account</text></svg>');
  await sharp({create:{width:2000,height:770,channels:3,background:'#ffffff'}}).composite([{input:label,left:0,top:0},{input:images[0],left:0,top:50},{input:images[1],left:1000,top:50}]).png().toFile(path.join(__dirname,'reference-comparison.png'));
})();
