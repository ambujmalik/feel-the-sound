/* Improved app.js: same core audio + three.js logic with cleaner structure
   and some small UX niceties (simulate fallback, polite user messages) */

let scene, camera, renderer, controls, container;
let audioContext, analyser, sourceNode, scriptNode;
let isPlaying = false;
let vizType = 'bars';
let bars = [], particles = [], waveform = [], sphere = null;
const freqSize = 256;
let freqData = new Uint8Array(freqSize);
let timeData = new Uint8Array(freqSize);

container = document.getElementById('container');
const startBtn = document.getElementById('startAudio');
const typeSelect = document.getElementById('visualizationType');
const sensitivityEl = document.getElementById('sensitivity');
const rotationEl = document.getElementById('rotation');
const statusEl = document.getElementById('status');
const togglePanel = document.getElementById('togglePanel');
const panel = document.getElementById('panel');

togglePanel.addEventListener('click', () => {
  // simple toggle: hide/show
  const hidden = panel.style.transform === 'translateX(-420px)';
  panel.style.transform = hidden ? 'translateX(0)' : 'translateX(-420px)';
});

// small helper to update status with subtle animation
function setStatus(text, recording=false){
  statusEl.textContent = text;
  statusEl.style.opacity = '0.98';
  statusEl.classList.toggle('recording', !!recording);
}

// --- THREE init
function initThree(){
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x071027, 0.03);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.set(0, 4, 18);

  renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // lights
  const a = new THREE.AmbientLight(0x445566, 0.8); scene.add(a);
  const d = new THREE.DirectionalLight(0xffffff, 0.9); d.position.set(5,10,7); scene.add(d);

  createVisualization();
  window.addEventListener('resize', onResize, {passive:true});
  animate();
}

// --- Visualization creators
function clearScene(){
  bars.forEach(b=>scene.remove(b)); bars=[];
  particles.forEach(p=>scene.remove(p)); particles=[];
  waveform.forEach(w=>scene.remove(w)); waveform=[];
  if(sphere){ scene.remove(sphere); sphere = null; }
}

function createVisualization(){
  clearScene();
  if(vizType === 'bars') createBars();
  else if(vizType === 'wave') createWave();
  else if(vizType === 'particles') createParticles();
  else if(vizType === 'sphere') createSphere();
}

function createBars(){
  const count = 64, width = 0.45, gap = 0.12;
  for(let i=0;i<count;i++){
    const g = new THREE.BoxGeometry(width,1,width);
    const m = new THREE.MeshStandardMaterial({ roughness:0.6, metalness:0.05, color:new THREE.Color().setHSL(i/count,0.9,0.55) });
    const mesh = new THREE.Mesh(g,m);
    mesh.position.x = (i - count/2) * (width + gap);
    mesh.position.y = 0;
    bars.push(mesh); scene.add(mesh);
  }
}

function createWave(){
  const n=128;
  for(let i=0;i<n;i++){
    const s = new THREE.SphereGeometry(0.08,10,10);
    const m = new THREE.MeshStandardMaterial({roughness:0.5,color:new THREE.Color().setHSL(i/n,0.8,0.5)});
    const p = new THREE.Mesh(s,m);
    p.position.x = (i - n/2) * 0.12;
    waveform.push(p); scene.add(p);
  }
}

function createParticles(){
  const count = 700;
  const pos = new Float32Array(count*3);
  const col = new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const r = 4 + Math.random()*6;
    const theta = Math.random()*Math.PI*2;
    const phi = Math.acos(2*Math.random()-1);
    const i3 = i*3;
    pos[i3] = r*Math.sin(phi)*Math.cos(theta);
    pos[i3+1] = r*Math.sin(phi)*Math.sin(theta);
    pos[i3+2] = r*Math.cos(phi);
    col[i3] = Math.random(); col[i3+1] = Math.random(); col[i3+2] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  geo.setAttribute('color', new THREE.BufferAttribute(col,3));
  const mat = new THREE.PointsMaterial({ size:0.12, vertexColors:true, transparent:true, opacity:0.95 });
  const points = new THREE.Points(geo, mat);
  particles.push(points); scene.add(points);
}

function createSphere(){
  const geo = new THREE.IcosahedronGeometry(5, 3);
  const mat = new THREE.MeshStandardMaterial({ wireframe:true, transparent:true, opacity:0.85 });
  sphere = new THREE.Mesh(geo, mat); scene.add(sphere);
}

// --- Audio
async function initAudio(){
  if(isPlaying) return;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;

    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    sourceNode = audioContext.createMediaStreamSource(stream);
    sourceNode.connect(analyser);

    // script node if we need per-frame processing (optional)
    scriptNode = audioContext.createScriptProcessor(2048, 1, 1);
    analyser.connect(scriptNode);
    scriptNode.connect(audioContext.destination);
    scriptNode.onaudioprocess = () => {
      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);
    };

    isPlaying = true;
    setStatus('Listening — microphone active', true);
  } catch(err){
    console.warn('Mic access failed, using simulated audio', err);
    setStatus('Microphone denied — simulating audio', true);
    simulateAudio();
    isPlaying = true;
  }
}

function simulateAudio(){
  // fill freq/time arrays smoothly
  setInterval(()=>{
    const t = Date.now() / 1000;
    for(let i=0;i<freqData.length;i++){
      const n = (i / 8) + t*1.2;
      freqData[i] = Math.abs(Math.sin(n))*200 + Math.abs(Math.sin(n*0.3))*50;
      timeData[i] = (Math.sin(i/8 + t*3)*0.5 + 0.5) * 255;
    }
  }, 50);
}

// --- Update visualization each frame
function updateViz(){
  if(!isPlaying) return;
  const sens = (Number(sensitivityEl.value) || 100) / 100;
  const rotSpeed = (Number(rotationEl.value) || 30) / 1000;
  scene.rotation.y += rotSpeed;

  if(vizType === 'bars'){
    for(let i=0;i<bars.length;i++){
      const b = bars[i];
      const idx = Math.floor(i * freqData.length / bars.length);
      const h = (freqData[idx] / 255) * 10 * sens;
      b.scale.y = Math.max(0.08, h);
      b.position.y = b.scale.y / 2;
      b.material.color.setHSL(Math.min(0.9, h/10), 0.9, 0.5);
    }
  } else if(vizType === 'wave'){
    for(let i=0;i<waveform.length;i++){
      const p = waveform[i];
      const amp = (timeData[i] - 128) / 128;
      p.position.y = amp * 5 * sens;
      p.position.z = Math.sin(i/10 + Date.now()/1000) * 2;
      p.material.color.setHSL((p.position.y + 5)/10, 0.85, 0.5);
    }
  } else if(vizType === 'particles'){
    if(particles.length===0) return;
    const pts = particles[0];
    const arr = pts.geometry.attributes.position.array;
    for(let i=0;i<arr.length;i+=3){
      const idx = Math.floor((i/3) % freqData.length);
      const amp = freqData[idx] / 255;
      const ox = arr[i], oy = arr[i+1], oz = arr[i+2];
      const len = Math.sqrt(ox*ox + oy*oy + oz*oz) || 1;
      const newR = len + amp * 2 * sens;
      const nx = (ox/len) * newR, ny = (oy/len) * newR, nz = (oz/len) * newR;
      arr[i] = nx; arr[i+1] = ny; arr[i+2] = nz;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  } else if(vizType === 'sphere'){
    if(!sphere) return;
    const pos = sphere.geometry.attributes.position;
    if(!pos.original) pos.original = pos.array.slice();
    const orig = pos.original;
    for(let i=0;i<pos.array.length;i+=3){
      const vid = i/3;
      const idx = Math.floor(vid % freqData.length);
      const amp = freqData[idx] / 255;
      const x = orig[i], y = orig[i+1], z = orig[i+2];
      const len = Math.sqrt(x*x + y*y + z*z) || 1;
      const disp = amp * 1.8 * sens;
      pos.array[i] = (x/len) * (5 + disp);
      pos.array[i+1] = (y/len) * (5 + disp);
      pos.array[i+2] = (z/len) * (5 + disp);
    }
    pos.needsUpdate = true;
    sphere.geometry.computeVertexNormals();
  }
}

// --- Animation loop
function animate(){
  requestAnimationFrame(animate);
  updateViz();
  controls.update();
  renderer.render(scene, camera);
}

// --- Events & wiring
startBtn.addEventListener('click', () => {
  if(!isPlaying) initAudio(); else setStatus('Already running', true);
});

typeSelect.addEventListener('change', (e) => {
  vizType = e.target.value;
  createVisualization();
  setStatus(`Mode: ${e.target.selectedOptions[0].text}`, false);
});

window.addEventListener('resize', onResize, {passive:true});

function onResize(){
  if(!renderer) return;
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// start
initThree();
setStatus('Ready — click Start', false);
