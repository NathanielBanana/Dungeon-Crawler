// Run with: node smoke-test.js
// Small DOM/canvas harness for the core flow; no browser dependencies.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const listeners = new Map();
const nodes = new Map();
const storage = new Map();
let now = 0, nextFrame;
const mobileMedia = {matches:false};
storage.set('dungeon-crawler-opened-v1', '["0,0"]'); // Ignore obsolete saved chest state.
const ctx = new Proxy({}, {get(target, key) {
  if (key === 'createRadialGradient') return () => ({addColorStop(){}});
  return target[key] || (() => {});
}});
function node(id) {
  if (!nodes.has(id)) nodes.set(id, {
    id, style:{}, classList:{add(){}, remove(){}, toggle(){}, contains(){return false;}},
    addEventListener(type, fn){listeners.set(`${id}:${type}`, fn);}, setPointerCapture(){},
    getContext(){return ctx;}, getBoundingClientRect(){return id==='touchJoystick'?{left:0,top:0,width:104,height:104}:{left:0,top:0,width:960,height:600};}
  });
  return nodes.get(id);
}
const windowListeners = new Map();
const sandbox = {
  document:{getElementById:node,querySelectorAll:()=>[]},
  window:{addEventListener:(type,fn)=>windowListeners.set(type,fn),matchMedia:()=>mobileMedia},
  localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
  performance:{now:()=>now},
  requestAnimationFrame:fn=>{nextFrame=fn;},
  Math, Set, Map, JSON, console
};
const source = fs.readFileSync('game.js','utf8').replace(
  '  requestAnimationFrame(frame);\n})();',
  '  window.testShop = {setShards(value){shards=value;updateHud();}, getShards(){return shards;}, getPlayer(){return player;}, getRoom(){return room;}, setRoom, openChest, death, isOpened(x,y){return opened.has(keyOf(x,y));}};\n  requestAnimationFrame(frame);\n})();'
);
vm.runInNewContext(source, sandbox);
const click = id => listeners.get(`${id}:click`)({preventDefault(){}});
const key = (type,k) => windowListeners.get(type)({key:k,preventDefault(){},repeat:false});
const tick = n => {for(let i=0;i<n;i++){now+=50;nextFrame(now);}};

click('playButton');
assert.equal(node('roomName').textContent,'THE ENTRY');
key('keydown','w');tick(7);key('keyup','w');
assert.match(node('prompt').textContent,/OPEN CHEST/);
key('keydown','e');key('keyup','e');
const api = sandbox.window.testShop;
assert(api.isOpened(0,0));
const firstWeapon = api.getPlayer().weapon.name;
click('inventoryButton');
assert.match(node('modalContent').innerHTML,/WEAPON: (Rusty Blade|Worn Saber|Chipped Axe)/);
api.death();
assert(!api.isOpened(0,0));
click('playButton');
key('keydown','w');tick(7);key('keyup','w');key('keydown','e');key('keyup','e');
assert(api.getPlayer().weapon);
assert.notEqual(api.getPlayer().weapon.name,firstWeapon);
const dropCount = api.getRoom().drops.length;
api.openChest(); // Still only one opening per run.
assert.equal(api.getRoom().drops.length,dropCount);
// Ordinary chests also reset and change loot across rounds.
api.setRoom(1,0);api.openChest();
const firstLoot = node('toast').textContent;
api.death();click('playButton');api.setRoom(1,0);api.openChest();
assert.notEqual(node('toast').textContent,firstLoot);
// Shard proximity collection applies to mobile, collects all nearby shards,
// leaves items and distant shards, and never runs while paused or dead.
click('playButton');
const drops = api.getRoom().drops, player = api.getPlayer();
drops.push({x:player.x+30,y:player.y,kind:'shard',value:2},
  {x:player.x-30,y:player.y,kind:'shard',value:3},
  {x:player.x+100,y:player.y,kind:'shard',value:7},
  {x:player.x,y:player.y,kind:'item',item:{kind:'heal',name:'Healing Flask',power:40}});
tick(1);assert.equal(api.getShards(),0); // Desktop keeps manual collection.
mobileMedia.matches=true;
click('inventoryButton');tick(1);assert.equal(api.getShards(),0);
click('closeModal');tick(1);assert.equal(api.getShards(),5);
assert.equal(drops.length,2);assert.equal(player.heal,null);
tick(2);assert.equal(api.getShards(),5);
assert(!node('prompt').textContent.includes('COLLECT SHARDS'));
api.death();drops.push({x:player.x,y:player.y,kind:'shard',value:10});
tick(1);assert.equal(api.getShards(),5);
mobileMedia.matches=false;
click('playButton');
key('keydown','d');tick(60);key('keyup','d');
assert.match(node('depthLabel').textContent,/DEPTH 1/);
click('shopButton');
assert.match(node('modalContent').innerHTML,/SHARD SHOP/);
const buy = id => listeners.get('modal:click')({target:{closest:selector => selector==='[data-buy]'?{dataset:{buy:id}}:null}});
buy('special4');
assert.equal(sandbox.window.testShop.getShards(),0);
assert.equal(sandbox.window.testShop.getPlayer().special,null);
sandbox.window.testShop.setShards(100);
buy('special1');
assert.equal(sandbox.window.testShop.getPlayer().special.tier,1);
assert.equal(sandbox.window.testShop.getShards(),90);
buy('special4');
assert.equal(sandbox.window.testShop.getPlayer().special.tier,4);
assert.equal(sandbox.window.testShop.getShards(),46);
buy('special2');
assert.equal(sandbox.window.testShop.getShards(),46);
buy('heal2');
assert.equal(sandbox.window.testShop.getPlayer().heal.power,70);
assert.equal(sandbox.window.testShop.getShards(),32);
buy('heal1');
assert.equal(sandbox.window.testShop.getShards(),32);
assert.match(node('shardCount').textContent,/32/);
click('closeModal');
sandbox.window.testShop.getPlayer().hp=20;
key('keydown','h');key('keyup','h');
assert.equal(sandbox.window.testShop.getPlayer().hp,90);
const pointer = (id,type,props={}) => listeners.get(`${id}:${type}`)({pointerId:1,clientX:52,clientY:52,preventDefault(){},...props});
const beforeMove = sandbox.window.testShop.getPlayer().x;
pointer('touchJoystick','pointerdown',{clientX:104});tick(5);
assert(sandbox.window.testShop.getPlayer().x>beforeMove);
pointer('touchJoystick','pointerup');
const stoppedAt = sandbox.window.testShop.getPlayer().x;tick(5);
assert.equal(sandbox.window.testShop.getPlayer().x,stoppedAt);
pointer('touchAttack','pointerdown');
assert(sandbox.window.testShop.getPlayer().nextAttack>now);
sandbox.window.testShop.getPlayer().hp=20;
sandbox.window.testShop.getPlayer().heal={kind:'heal',power:40,uses:1};
pointer('touchHeal','pointerdown');
assert.equal(sandbox.window.testShop.getPlayer().hp,60);
pointer('touchSpecial','pointerdown');
assert.equal(sandbox.window.testShop.getPlayer().special,null);
console.log('Smoke test passed: chest reset and varied loot, mobile shard pickup, shop, joystick, attack, healing, and special touch controls.');
