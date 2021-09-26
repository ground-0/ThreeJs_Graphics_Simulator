import * as THREE from 'https://threejsfundamentals.org/threejs/resources/threejs/r127/build/three.module.js';
import {OrbitControls} from 'https://threejsfundamentals.org/threejs/resources/threejs/r127/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from 'https://threejsfundamentals.org/threejs/resources/threejs/r127/examples/jsm/loaders/GLTFLoader.js';
import {SkeletonUtils} from 'https://threejsfundamentals.org/threejs/resources/threejs/r127/examples/jsm/utils/SkeletonUtils.js';

const canvas = document.querySelector('#c');
const renderer = new THREE.WebGLRenderer({canvas});

let cameras = [];
const fov = 45;
const aspect = 2;  // the canvas default
const near = 0.1;
const far = 1000;
const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
camera.position.set(0, 40, 80);
camera.lookAt(0,0,0);
renderer.shadowMap.enabled = true;


const scene = new THREE.Scene();
const loader = new THREE.TextureLoader();
const bgTexture = loader.load('./background.jpg');
const scTexture = loader.load('./scenery.jpg');
const ofTexture = loader.load('./office.jpg');
const peTexture = loader.load('./penguins.png');
//scene.background = bgTexture;

const groundGeometry = new THREE.PlaneGeometry(100, 200);
const groundMaterial = new THREE.MeshPhongMaterial({
  map: loader.load('./basketball_court.jpg')
});
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
groundMesh.rotation.x = Math.PI * -.5;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

const manager = new THREE.LoadingManager();
manager.onLoad = init;

const progressbarElem = document.querySelector('#progressbar');
manager.onProgress = (url, itemsLoaded, itemsTotal) => {
  progressbarElem.style.width = `${itemsLoaded / itemsTotal * 100 | 0}%`;
};

const models = {
  knight: { url: 'https://threejsfundamentals.org/threejs/resources/models/knight/KnightCharacter.gltf' },
  truck: { url: './low_poly_hovercar/scene.gltf' },
  car: { url: './low-poly_sedan_car/scene.gltf' },
  car1: {url: './low_poly_small_car/scene.gltf'},
  drone: {url: './drone/scene.gltf'}
};


const gltfLoader = new GLTFLoader(manager);
for (const model of Object.values(models)) 
{
  
  gltfLoader.load(model.url, (gltf) => {
    gltf.scene.traverse( function( node ) {
      if ( node.isMesh ) { node.castShadow = true; }
  } );
    model.gltf = gltf;
  });
}

function prepModelsAndAnimations() 
{
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  Object.values(models).forEach(model => {
    console.log('------->:', model.url);
    box.setFromObject(model.gltf.scene);
    box.getSize(size);
    model.size = size.length();
    console.log(model.size);
    const animsByName = {};
    model.gltf.animations.forEach((clip) => 
    {
      animsByName[clip.name] = clip;
    });
    model.animations = animsByName;
  });
}


class InputManager 
{
  constructor() 
  {
    this.keys = {};
    const keyMap = new Map();

    const setKey = (keyName, pressed) => {
      const keyState = this.keys[keyName];
      keyState.justPressed = pressed && !keyState.down;
      keyState.down = pressed;
    };

    const addKey = (keyCode, name) => {
      this.keys[name] = { down: false, justPressed: false };
      keyMap.set(keyCode, name);
    };

    const setKeyFromKeyCode = (keyCode, pressed) => {
      const keyName = keyMap.get(keyCode);
      if (!keyName) 
      {
        return;
      }
      setKey(keyName, pressed);
    };

    addKey(37, 'left');
    addKey(39, 'right');
    addKey(38, 'up');
    addKey(40, 'down');
    addKey(87,'w');
    addKey(67, 'c');
    addKey(71,'g');
    addKey(48,'zero');
    addKey(49,'one');
    addKey(50,'two');
    addKey(51,'three');
    addKey(52,'four');
    addKey(53,'five');
    addKey(81,'q');
    addKey(83,'s');

    window.addEventListener('keydown', (e) => {
      setKeyFromKeyCode(e.keyCode, true);
    });
    window.addEventListener('keyup', (e) => {
      setKeyFromKeyCode(e.keyCode, false);
    });
  }
  update() 
  {
    for (const keyState of Object.values(this.keys)) 
    {
      if (keyState.justPressed) 
      {
        keyState.justPressed = false;
      }
    }
  }
}

  

const kForward = new THREE.Vector3(0, 0, 1);
const globals = {
  time: 0,
  deltaTime: 0,
  moveSpeed: 16,
  isFollow1:0,
  isFollow2:0,
  isGrab:0,
  camera:[],
  cameraIdx:0
};
globals.camera.push(camera);
const inputManager = new InputManager();

// Base for all components
class Component 
{
  constructor(playerObject) 
  {
    this.playerObject = playerObject;
  }
  update() 
  {
  }
}


class SkinInstance 
{
  constructor(playerObject, model) 
  {
    this.model = model;
    globals.playHitRad = model.size/2;
    this.animRoot = SkeletonUtils.clone(this.model.gltf.scene);
    this.mixer = new THREE.AnimationMixer(this.animRoot);
    playerObject.transform.add(this.animRoot);
    this.actions = {};
  }
  setAnimation(animName) 
  {
    const clip = this.model.animations[animName];
    // turn off all current actions
    for (const action of Object.values(this.actions)) 
    {
      action.enabled = false;
    }
    // get or create existing action for clip
    const action = this.mixer.clipAction(clip);
    action.enabled = true;
    action.reset();
    action.play();
    this.actions[animName] = action;
  }
  update() 
  {
    this.mixer.update(globals.deltaTime);
  }
}

class FiniteStateMachine 
{
  constructor(states, initialState) 
  {
    this.states = states;
    this.transition(initialState);
  }
  get state() 
  {
    return this.currentState;
  }
  transition(state) 
  {
    const oldState = this.states[this.currentState];
    if (oldState && oldState.exit) 
    {
      oldState.exit.call(this);
    }
    this.currentState = state;
    const newState = this.states[state];
    if (newState.enter) 
    {
      newState.enter.call(this);
    }
  }
  update() 
  {
    const state = this.states[this.currentState];
    if (state.update) 
    {
      state.update.call(this);
    }
  }
}

class Player
{
  constructor(parent) 
  {
    this.transform = new THREE.Object3D();
    parent.add(this.transform);
    const cam = new THREE.PerspectiveCamera(45,2,0.1,1000);
    cam.position.set(0,5.5,0.7);
    cam.rotation.y+=Math.PI;
    this.transform.add(cam);
    globals.camera.push(cam);
    this.parent = parent;
    const model = models.knight;
    this.skinInstance = new SkinInstance(this,model);
    this.hitRadius = model.size/2;
    this.turnSpeed = globals.moveSpeed / 4;
    this.fsm = new FiniteStateMachine({
        idle: {
            enter: ()=>{
                this.skinInstance.setAnimation('Idle');
            },
            update: ()=>{
                if(inputManager.keys.w.down &&globals.isGrab==0)
                  this.fsm.transition('run');
            }
          },
          run: {
              enter: ()=>{
                  this.skinInstance.setAnimation('Run');
              },
              update: ()=>{
                  if(inputManager.keys.w.down!=1)
                      this.fsm.transition('idle');
              }
          }
    },'idle');
  }
  update() 
  {
    if(globals.cameraIdx!=2)
    {
      const {deltaTime, moveSpeed} = globals;
      const transform = this.transform;
      const deltaMv = (inputManager.keys.w.down ? 1:0);
      const delta = (inputManager.keys.left.down  ?  1 : 0) +
                    (inputManager.keys.right.down ? -1 : 0);
            
      transform.rotation.y += this.turnSpeed * delta * deltaTime;
      if(globals.isGrab==0)transform.translateOnAxis(kForward, deltaMv*moveSpeed * deltaTime);
      this.fsm.update();
      this.skinInstance.update();
    } 
  }
  changeParent(newParent)
  {
    this.parent.remove(this.transform);
    newParent.add(this.transform);
    this.parent = newParent;
  }
}
class Drone
{
  constructor(parent,model,v1)
  {
    this.transform = new THREE.Object3D();
    parent.add(this.transform);
    this.model = model;
    this.hitRadius = model.size/2;
    this.transform.position.set(v1.x,v1.y,v1.z);
    this.animRoot = SkeletonUtils.clone(this.model.gltf.scene);
    this.transform.add(this.animRoot);
    this.camera = new THREE.PerspectiveCamera(45,2,0.1,1000);
    this.camera.position.set(0,-2.5,3);
    this.camera.lookAt(-v1.x,-v1.y-20,-v1.z+100);
    this.parent = parent;
    this.transform.add(this.camera);
    globals.camera.push(this.camera);
    this.turnSpeed = globals.moveSpeed / 4;
  }
  update()
  {
    if(globals.cameraIdx==2)
    {
      const deltaMv = (inputManager.keys.w.down ? 1:0) + (inputManager.keys.s.down ? -1:0);
      const deltaTurn = (inputManager.keys.left.down  ?  1 : 0) +
                    (inputManager.keys.right.down ? -1 : 0);
      const deltaFly = (inputManager.keys.up.down  ?  1 : 0) +
                    (inputManager.keys.down.down ? -1 : 0);      
      this.transform.rotation.y += this.turnSpeed * deltaTurn * globals.deltaTime;
      this.transform.translateOnAxis(kForward, deltaMv*globals.moveSpeed * globals.deltaTime);
      this.transform.translateOnAxis(new THREE.Vector3(0,1,0),deltaFly*globals.moveSpeed * globals.deltaTime)
    }
  }
}
class MovingObject
{
  constructor(parent,model,v1)
  {
      this.transform = new THREE.Object3D();
      parent.add(this.transform);
      this.model = model;
      this.hitRadius = model.size/2;
      this.transform.position.set(v1.x,v1.y,v1.z);
      this.animRoot = SkeletonUtils.clone(this.model.gltf.scene);
      this.transform.add(this.animRoot);
      this.targetHistory = []
  }
  addHistory(trget)
  {
    const trgetGO = trget.transform.position;
    const newPos = new THREE.Vector3();
    newPos.copy(trgetGO);
    this.targetHistory.push(newPos);
  }
}
function minMagnitude(v, min) 
{
  return Math.abs(v) > min
      ? min * Math.sign(v)
      : v;
}
function aimTowardsAndGetDistance(src, tgetPos, mxT)
{
  const delta = new THREE.Vector3();
  delta.subVectors(tgetPos,src.position);
  const tgetRot = Math.atan2(delta.x,delta.z)+Math.PI/2;
  const deltaRot = THREE.MathUtils.euclideanModulo(tgetRot - src.rotation.y+Math.PI/2,Math.PI*2)-Math.PI;
  const theta = minMagnitude(deltaRot,mxT);
  src.rotation.y = THREE.MathUtils.euclideanModulo(src.rotation.y+theta,Math.PI*2);
  return delta.length();
}



class GroupObjects 
{
    constructor(parent)
    {
      this.maxTurnSpeed = 2*globals.moveSpeed/4;
      this.leader = new MovingObject(parent,models.truck,new THREE.Vector3(32,0,20),-1);
      this.f1 = new MovingObject(parent,models.car,new THREE.Vector3(0,0,-10),0);
      this.f2 = new MovingObject(parent,models.car1,new THREE.Vector3(-32,0,20),1);
      globals.hovHitRad = this.leader.hitRadius;
      this.curve = new THREE.SplineCurve( [
          new THREE.Vector2( 32,20 ),
          new THREE.Vector2( 32,22 ),
          new THREE.Vector2( 32,25 ),
          new THREE.Vector2( 0,30 ),
          new THREE.Vector2( -32,25 ),
          new THREE.Vector2( -32,22 ),
          new THREE.Vector2( -32,20 ),
          new THREE.Vector2( -32,18 ),
          new THREE.Vector2( -32,15 ),
          new THREE.Vector2( 0,10 ),
          new THREE.Vector2( 32,15 ),
          new THREE.Vector2( 32,18 ),
          new THREE.Vector2( 32,20 ),
        ] );
        this.points = this.curve.getPoints( 100 );
        const geometry = new THREE.BufferGeometry().setFromPoints(this.points);
        const material = new THREE.LineBasicMaterial( { color : 0xff0000 } );
        material.visible = true;
        this.splineObject = new THREE.Line( geometry, material );
        this.splineObject.rotation.x = Math.PI * .5;
        this.splineObject.position.y = 0.05;
        parent.add(this.splineObject);
    }
    update()
    {
      this.f2.addHistory(this.f1);
      if(globals.isFollow2==0)
      {
        const targetPos = this.f2.targetHistory[0];
        const mxDis = globals.moveSpeed * globals.deltaTime;
        const mxTurn = this.maxTurnSpeed*globals.deltaTime;
        const dis = aimTowardsAndGetDistance(this.f2.transform,targetPos,mxTurn);
        this.f2.transform.translateOnAxis(kForward,Math.min(dis,mxDis));
        if(dis<=mxDis)
        {
          globals.isFollow2=1;
          console.log(this.f2.targetHistory.length);
        }
      }
      else
      {
        const targetPos = this.f2.targetHistory.shift();
        this.f2.transform.position.copy(targetPos);
        const theta = this.maxTurnSpeed*globals.deltaTime;
        aimTowardsAndGetDistance(this.f2.transform,this.f2.targetHistory[0],theta);
      }
      this.f1.addHistory(this.leader);
      if(globals.isFollow1==0)
      {
        const targetPos = this.f1.targetHistory[0];
        const mxDis = globals.moveSpeed * globals.deltaTime;
        const mxTurn = this.maxTurnSpeed*globals.deltaTime;
        const dis = aimTowardsAndGetDistance(this.f1.transform,targetPos,mxTurn);
        this.f1.transform.translateOnAxis(kForward,Math.min(dis,mxDis));
        //console.log(targetPos);
        if(dis<=mxDis)
        {
          console.log(this.f1.targetHistory.length);
          globals.isFollow1=1;
        }
      }
      else
      {
        const targetPos = this.f1.targetHistory.shift();
        this.f1.transform.position.copy(targetPos);
        const theta = this.maxTurnSpeed*globals.deltaTime;
        aimTowardsAndGetDistance(this.f1.transform,this.f1.targetHistory[0],theta);
      } 
      const leadPos = new THREE.Vector2();
      const leadTarget = new THREE.Vector2();                    
      this.curve.getPointAt((globals.time*0.05)%1,leadPos);
      this.curve.getPointAt(((globals.time*0.05)+0.01)%1,leadTarget);
      this.leader.transform.position.set(leadPos.x,0,leadPos.y);
      this.leader.transform.lookAt(leadTarget.x,0,leadTarget.y);
      //console.log(this.leader.transform.position);
    }
}

class CollisionChecker
{
  constructor(player,movObj1)
  {
    this.player = player;
    this.movObj1 = movObj1;
  }
  isClose(obj1, obj1Radius, obj2, obj2Radius) 
  {
    const minDist = obj1Radius + obj2Radius;
    const dist = obj1.position.distanceTo(obj2.position);
    return dist < minDist;
  }
  update()
  {
    if(inputManager.keys.g.justPressed)
    {
      if(globals.isGrab==0)
      {
        console.log(globals.isGrab);
        if(this.isClose(this.player.transform,this.player.hitRadius,this.movObj1.transform,this.movObj1.hitRadius))
        {
          let temp = new THREE.Vector3();
          temp.subVectors(this.player.transform.position,this.movObj1.transform.position);
          this.player.transform.position.copy(temp);
          this.player.changeParent(this.movObj1.transform);
          globals.isGrab = 1;
        }
      }
      else
      {
        let temp = new THREE.Vector3();
        temp.addVectors(this.player.transform.position,this.movObj1.transform.position);
        this.player.transform.position.copy(temp);
        this.player.changeParent(scene);
        globals.isGrab = 0;
      }
    }
  }
}

function makeCylinder(color, x, z, height) 
{
  const geometry = new THREE.CylinderGeometry(1, 1, height, 32);
  const material = new THREE.MeshPhongMaterial({ color });
  const cylinder = new THREE.Mesh(geometry, material);
  cylinder.castShadow = true;
  cylinder.position.x = x;
  cylinder.position.z = z;
  return cylinder;
}

function makeSphere(radius, x, y, z) 
{
  const geometry = new THREE.SphereGeometry(radius, 30, 30);
  const material = new THREE.MeshPhongMaterial({ color: 0xF8F8FF });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.castShadow = true;
  sphere.position.x = x;
  sphere.position.y = y;
  sphere.position.z = z;
  return sphere;
}

function makeCuboid(x, y, z, l = 8, b = 2, h = 2, op = 0.1) 
{
  const geometry = new THREE.BoxGeometry(l, b, h);
  const material = new THREE.MeshPhongMaterial({ color: 0xF8F8FF, transparent: true, opacity: op });
  const cube = new THREE.Mesh(geometry, material);
  cube.castShadow = true;
  cube.position.x = x;
  cube.position.y = y;
  cube.position.z = z;
  return cube;
}

function addPointLight(intens,...pos) 
{
  const color = 0xFFFFFF;
  const intensity = intens;
  const light = new THREE.PointLight(color, intensity,200,2);
  light.position.set(...pos);
  light.castShadow = true;
  return light;
}
function addSpotLight(intens) 
{
  const color = 0x00EAFF;
  const intensity = intens;
  let light = new THREE.SpotLight(color, intensity,200,2);
  light.castShadow = true;
  light.angle = Math.PI/20;
  return light;
}
class StaticLightObject
{
  constructor(parent,v1,v2,v3,color,pos)
  {
    this.c1 = makeCylinder(color, v1.x, v1.y, v1.z);
    this.c2 = makeCylinder(color, v2.x, v2.y, v2.z);
    this.c3 = makeCylinder(color, v3.x, v3.y, v3.z);
    this.cuboid = makeCuboid(color,v2.x,(v2.z/2)+1,v2.y);
    this.light = addPointLight(0.825,v2.x,(v2.z/2)+0.5,v2.y);
    this.pos = pos;
    this.sw = 1;
    parent.add(this.c1);
    parent.add(this.c2);
    parent.add(this.c3);
    parent.add(this.cuboid);
    parent.add(this.light);
  }
  update()
  {
    if(inputManager.keys[this.pos].justPressed)this.sw = (this.sw+1)%2;
    if(this.sw==1)this.light.visible=true;
    else this.light.visible=false;
  }
}
class SearchLightObject
{
  constructor(parent,r,v1,obj,color,pos)
  {
    this.c1 = makeCylinder(color,v1.x,v1.y,v1.z);
    this.s1 = makeSphere(r,v1.x,v1.z/2,v1.y);
    this.obj = obj;
    this.light = addSpotLight(0.825);
    this.light.position.set(v1.x,v1.z,v1.y);
    this.light.target.position.set(this.obj.position.x,this.obj.position.y,this.obj.position.z);
    this.pos = pos;
    this.sw = 1;
    parent.add(this.c1);
    parent.add(this.s1);
    parent.add(this.light);
    parent.add(this.light.target);
    console
  }
  update()
  {
    if(inputManager.keys[this.pos].justPressed)this.sw = (this.sw+1)%2;
    if(this.sw==1)this.light.visible=true;
    else this.light.visible=false;
    this.light.target.position.set(this.obj.position.x,this.obj.position.y,this.obj.position.z);
    //console.log(this.obj.position.x);
  }
}

class MovingLightObject
{
  constructor(parent,v1,pos)
  {
    this.light = addPointLight(0.2,v1.x,v1.y,v1.z);
    this.pos = pos;
    this.sw = 1;
    parent.add(this.light);
  }
  update()
  {
    if(inputManager.keys[this.pos].justPressed)this.sw = (this.sw+1)%2;
    if(this.sw==1)this.light.visible=true;
    else this.light.visible=false;
  }
}
class TextureObjects
{
  constructor()
  {
    this.sphere = new THREE.SphereGeometry(5,30,30);
    this.cylinder = new THREE.CylinderGeometry(5,8,10,30);
    this.doca = new THREE.DodecahedronGeometry(5,10);
    this.mat1 = new THREE.MeshPhongMaterial({
      map:scTexture
    });
    this.mat2 = new THREE.MeshPhongMaterial({
      map:ofTexture
    });
    this.mat3 = new THREE.MeshPhongMaterial({
      map:peTexture
    });
    this.pos = 0;
    this.ch = 0;
    this.lst = [];
    this.mat = [];
    this.mat.push(this.mat1);
    this.mat.push(this.mat2);
    this.mat.push(this.mat3);
    this.lst.push(new THREE.Mesh(this.cylinder,this.mat1));
    this.lst.push(new THREE.Mesh(this.sphere,this.mat1));
    this.lst.push(new THREE.Mesh(this.doca,this.mat1));

    this.lst[0].position.set(20,5,-60);
    this.lst[1].position.set(0,5,-60);
    this.lst[2].position.set(-20,5,-60);

    this.lst.forEach(mesh=>{
      scene.add(mesh);
    });
  }
  update()
  {
    if(inputManager.keys['q'].justPressed)this.ch = this.ch+1;
    if(this.ch>0)
    {
      console.log()
      this.pos = (this.pos+this.ch)%3
      this.lst.forEach(mesh=>{
        mesh.material = this.mat[this.pos];
      });
      this.ch = 0;
    }
  }
}
  




let lst = [];
function init() 
{
  // hide the loading bar
  const loadingElem = document.querySelector('#loading');
  loadingElem.style.display = 'none';

  prepModelsAndAnimations();
  const playerObject = new Player(scene);
  const movGrp = new GroupObjects(scene);
  lst.push(movGrp);
  lst.push(playerObject);
  lst.push(new StaticLightObject(scene,new THREE.Vector3(28, -90.5, 30),new THREE.Vector3(30, -90, 30),new THREE.Vector3(32, -89.5, 30),0xA0522D,'zero'));
  lst.push(new StaticLightObject(scene,new THREE.Vector3(28, 40.5, 30),new THREE.Vector3(30, 40, 30),new THREE.Vector3(32, 39.5, 30),0xA0522D,'one'))
  lst.push(new StaticLightObject(scene,new THREE.Vector3(-28, 40.5, 30),new THREE.Vector3(-30, 40, 30),new THREE.Vector3(-32, 39.5, 30),0xA0522D,'two'));
  lst.push(new StaticLightObject(scene,new THREE.Vector3(-28, -90.5, 30),new THREE.Vector3(-30, -90, 30),new THREE.Vector3(-32, -89.5, 30),0xA0522D,'three'));
  lst.push(new SearchLightObject(scene,1,new THREE.Vector3(0, -30, 15),lst[0].leader.transform,0xA0522D,'four'));
  lst.push(new MovingLightObject(lst[1].transform,new THREE.Vector3(0,1,0),'five'));
  let cuboid = makeCuboid(1.1, 1, 0, 1, 1, 1, 0.4);
  if(lst.length>0)lst[1].transform.add(cuboid);
  lst.push(new TextureObjects());
  lst.push(new Drone(scene,models.drone,new THREE.Vector3(0,10,0)));
  lst.push(new CollisionChecker(playerObject,movGrp.leader));
}

function resizeRendererToDisplaySize(renderer) 
{
  const canvas = renderer.domElement;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
  }
  return needResize;
}

let then = 0;;
function render(now) {
  // convert to seconds
  globals.time = now * 0.001;
  // make sure delta time isn't too big.
  globals.deltaTime = Math.min(globals.time - then, 1 / 20);
  then = globals.time;

  if (resizeRendererToDisplaySize(renderer)) 
  {
    const canvas = renderer.domElement;
    cameras.forEach(camera=>{
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    });
  }
  if(inputManager.keys.c.justPressed)globals.cameraIdx = (globals.cameraIdx+1)%3;
  lst.forEach(primitves => {
    primitves.update();
});
  inputManager.update();

  renderer.render(scene, globals.camera[globals.cameraIdx]);

  requestAnimationFrame(render);
}
render();
