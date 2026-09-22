/** Songbird BirdNET inference worker.
 * Adapted from birdnet-team/real-time-pwa worker architecture.
 * Requires TFJS and BirdNET model assets under /models/birdnet.
 */
const params=new URL(self.location.href).searchParams;
const ROOT=params.get('root')||'../models';
const TF_PATH=params.get('tf')||'./tfjs-4.14.0.min.js';
importScripts(TF_PATH);
const BASE=ROOT+'/birdnet';
const MODEL_PATH=BASE+'/model.json';
const AREA_MODEL_PATH=BASE+'/area-model/model.json';
const LABELS_DIR=BASE+'/labels';
const SAMPLE_RATE=48000, WINDOW_SAMPLES=144000;
let birdModel=null,areaModel=null,birds=[];

class MelSpecLayerSimple extends tf.layers.Layer{
 constructor(config){super(config);this.sampleRate=config.sampleRate;this.specShape=config.specShape;this.frameStep=config.frameStep;this.frameLength=config.frameLength;this.melFilterbank=tf.tensor2d(config.melFilterbank)}
 build(){this.magScale=this.addWeight('magnitude_scaling',[],'float32',tf.initializers.constant({value:1.23}));super.build()}
 computeOutputShape(inputShape){return[inputShape[0],this.specShape[0],this.specShape[1],1]}
 call(inputs){return tf.tidy(()=>tf.stack(inputs[0].split(inputs[0].shape[0]).map(input=>{let spec=input.squeeze();spec=tf.sub(spec,tf.min(spec,-1,true));spec=tf.div(spec,tf.max(spec,-1,true).add(1e-6));spec=tf.sub(spec,.5).mul(2);spec=tf.signal.stft(spec,this.frameLength,this.frameStep);spec=tf.abs(spec);spec=tf.matMul(spec,this.melFilterbank).pow(2);spec=spec.pow(tf.div(1,tf.add(1,tf.exp(this.magScale.read()))));spec=tf.reverse(spec,-1);return tf.transpose(spec).expandDims(-1)})))}
 static get className(){return'MelSpecLayerSimple'}
}

async function loadLabels(){
 const lang=params.get('lang')||'pt';
 const en=(await fetch(LABELS_DIR+'/en_us.txt').then(r=>{if(!r.ok)throw Error('labels en_us');return r.text()})).split('\n').filter(Boolean);
 let loc=en;try{loc=(await fetch(`${LABELS_DIR}/${lang}.txt`).then(r=>r.text())).split('\n').filter(Boolean)}catch{}
 birds=en.map((line,i)=>{const [scientificName,commonName]=line.split('_');const [,commonNameI18n]=((loc[i]||line).split('_'));return{scientificName:scientificName||line,commonName:commonName||line,commonNameI18n:commonNameI18n||commonName||line,geoscore:1}})
}

async function init(){
 try{
  tf.serialization.registerClass(MelSpecLayerSimple);
  try{await tf.setBackend('webgl')}catch(e){await tf.setBackend('cpu')}
  await tf.ready();
  postMessage({message:'load_model',progress:5});
  birdModel=await tf.loadLayersModel(MODEL_PATH,{onProgress:p=>postMessage({message:'load_model',progress:Math.round(p*75)})});
  tf.tidy(()=>birdModel.predict(tf.zeros([1,WINDOW_SAMPLES])));
  try{areaModel=await tf.loadGraphModel(AREA_MODEL_PATH)}catch(e){console.warn('BirdNET geo model unavailable',e)}
  await loadLabels();
  if(birds.length!==birdModel.outputs[0].shape.at(-1))throw Error('Rótulos BirdNET incompatíveis com o modelo');
  postMessage({message:'loaded'});
 }catch(e){postMessage({message:'error',error:e?.message||String(e)})}
}

function pooled(predictionList){
 const n=predictionList[0]?.length||0,a=5,s=new Float64Array(n);
 for(const row of predictionList)for(let i=0;i<n;i++)s[i]+=Math.exp(a*row[i]);
 return Array.from(s,(v,i)=>({index:i,scientificName:birds[i]?.scientificName||'',commonName:birds[i]?.commonName||'',commonNameI18n:birds[i]?.commonNameI18n||'',confidence:Math.log(v/predictionList.length)/a,geoscore:birds[i]?.geoscore??1}))
}

async function predict(data){
 const pcm=data.pcmAudio||new Float32Array(0);if(pcm.length<WINDOW_SAMPLES)throw Error('Áudio menor que 3 segundos');
 if(Number.isFinite(data.latitude)&&Number.isFinite(data.longitude))await areaScores(Number(data.latitude),Number(data.longitude));
 const overlap=Math.min(2.5,Math.max(0,Number(data.overlapSec??1.5))),hop=Math.max(1,WINDOW_SAMPLES-Math.round(overlap*SAMPLE_RATE));
 const frames=Math.max(1,Math.ceil(Math.max(0,pcm.length-WINDOW_SAMPLES)/hop)+1),framed=new Float32Array(frames*WINDOW_SAMPLES);
 for(let f=0;f<frames;f++){const start=f*hop;framed.set(pcm.subarray(start,Math.min(start+WINDOW_SAMPLES,pcm.length)),f*WINDOW_SAMPLES)}
 const x=tf.tensor2d(framed,[frames,WINDOW_SAMPLES]);let y;
 try{y=birdModel.predict(x);const list=await y.array();postMessage({message:'pooled',pooled:pooled(list)})}finally{x.dispose();y?.dispose()}
}

async function areaScores(lat,lon){
 if(!areaModel||!birds.length)return;
 try{const week=Math.max(1,Math.min(48,Math.ceil((((Date.now()-new Date(new Date().getFullYear(),0,1))/86400000)+1)/7)));const input=tf.tensor2d([[lat,lon,week]],[1,3]);const out=areaModel.execute(input);const scores=await(Array.isArray(out)?out[0]:out).data();input.dispose();if(Array.isArray(out))out.forEach(t=>t.dispose());else out.dispose();for(let i=0;i<birds.length&&i<scores.length;i++)birds[i].geoscore=scores[i]}catch(e){console.warn('Geo score failed',e)}
}

onmessage=async({data})=>{try{if(data.message==='predict')await predict(data);else if(data.message==='area-scores')await areaScores(Number(data.latitude),Number(data.longitude))}catch(e){postMessage({message:'error',error:e?.message||String(e)})}};
init();
