(() => {
  'use strict';
  const W = 960, H = 600, TAU = Math.PI * 2;
  const $ = id => document.getElementById(id);
  const canvas = $('gameCanvas'), ctx = canvas.getContext('2d');
  const ui = {menu:$('menu'), game:$('game'), modal:$('modal'), content:$('modalContent'), prompt:$('prompt'), toast:$('toast'), roomName:$('roomName'), depth:$('depthLabel'), hint:$('roomHint'), hp:$('healthFill'), en:$('energyFill'), hpText:$('healthValue'), enText:$('energyValue'), shards:$('shardCount')};
  const keys = new Set();
  const touchMove = {x:0,y:0};
  const rooms = new Map();
  const opened = new Set(), previousChestLoot = new Map();
  const mobileControls = window.matchMedia('(max-width:760px), (pointer:coarse)');
  let running = false, paused = false, room, px = 0, py = 0, visited = new Set(), deepest = 0, shards = 0;
  let player, lastFrame = 0, toastUntil = 0, swingUntil = 0, swingAngle = 0;
  const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const keyOf = (x,y) => `${x},${y}`;
  const hash = (x,y,s=0) => { let n = Math.imul(x+9176,374761393) + Math.imul(y-2814,668265263) + Math.imul(s+7,1442695041); n = Math.imul(n^(n>>>13),1274126177); return (n^(n>>>16))>>>0; };
  const rand = (x,y,s) => hash(x,y,s)/4294967295;
  const depthAt = (x,y) => Math.abs(x)+Math.abs(y);
  const weaponNames = ['Rusty Blade','Iron Fang','Moonsteel Sword','Void Cutter','Sunfall Edge'];
  const weaponColors = ['#bcae8b','#c6d0d0','#8bc4d6','#ad84d5','#f1ca6c'];
  function weapon(tier){ return {kind:'weapon',name:weaponNames[clamp(tier,0,4)],tier:clamp(tier,0,4),damage:[15,22,30,40,54][clamp(tier,0,4)],color:weaponColors[clamp(tier,0,4)]}; }
  const heal = (power=40) => ({kind:'heal',name:power>=100?'Phoenix Flask':power>=70?'Greater Flask':'Healing Flask',power,uses:1,color:'#7dcb77'});
  const relic = tier => ({kind:'special',name:tier>=3?'Starfire Sigil':'Ember Charm',tier:clamp(tier,1,4),color:'#d794d9'});
  const shopItems = [
    {id:'heal1',kind:'heal',power:40,price:6}, {id:'heal2',kind:'heal',power:70,price:14}, {id:'heal3',kind:'heal',power:100,price:24},
    {id:'special1',kind:'special',tier:1,price:10}, {id:'special2',kind:'special',tier:2,price:18}, {id:'special3',kind:'special',tier:3,price:30}, {id:'special4',kind:'special',tier:4,price:44},
    {id:'weapon1',kind:'weapon',tier:1,price:12}, {id:'weapon2',kind:'weapon',tier:2,price:24}, {id:'weapon3',kind:'weapon',tier:3,price:38}, {id:'weapon4',kind:'weapon',tier:4,price:55}
  ];
  const shopItem = offer => offer.kind==='heal'?heal(offer.power):offer.kind==='special'?relic(offer.tier):weapon(offer.tier);
  function freshPlayer(){ return {x:480,y:332,hp:100,maxHp:100,energy:100,maxEnergy:100,weapon:null,heal:null,special:null,facing:-Math.PI/2,nextAttack:0,invuln:0,blocking:false}; }
  function makeRoom(x,y){
    const d=depthAt(x,y), boss=d>0&&d%5===0;
    const type=['THE HOLLOW','ASHEN VAULT','CRYPT OF ECHOES','DUSK CHAMBER','THE DEEP'][hash(x,y,2)%5];
    const enemies=[];
    if(d){ const count=boss?1:1+hash(x,y,3)%3; for(let i=0;i<count;i++){
      let ex=200+rand(x,y,20+i)*560,ey=145+rand(x,y,30+i)*315;
      if(Math.hypot(ex-480,ey-332)<115) ey=145;
      const alien=hash(x,y,50+i)%3===0;
      const maxHp=boss?125+d*7:alien?38+d*4:48+d*5;
      enemies.push({x:ex,y:ey,hp:maxHp,maxHp,boss,alien,r:boss?23:alien?14:17,hitAt:0,flash:0,phase:rand(x,y,70+i)*TAU});
    }}
    return {x,y,d,boss,type,enemies,drops:[],chest:{x:x===0&&y===0?480:210+rand(x,y,8)*540,y:x===0&&y===0?205:177+rand(x,y,9)*225},chestExists:x===0&&y===0||rand(x,y,10)<.66};
  }
  function getRoom(x,y){const k=keyOf(x,y);if(!rooms.has(k))rooms.set(k,makeRoom(x,y));return rooms.get(k);}
  function setRoom(x,y,entrance){
    px=x;py=y;room=getRoom(x,y);visited.add(keyOf(x,y));deepest=Math.max(deepest,room.d);
    if(entrance==='left'){player.x=875;player.y=300;player.facing=Math.PI;}
    else if(entrance==='right'){player.x=85;player.y=300;player.facing=0;}
    else if(entrance==='up'){player.x=480;player.y=515;player.facing=-Math.PI/2;}
    else if(entrance==='down'){player.x=480;player.y=85;player.facing=Math.PI/2;}
    ui.roomName.textContent=room.d===0?'THE ENTRY':room.boss?'BOSS · '+room.type:room.type;
    ui.depth.textContent=`DEPTH ${room.d} · ROOMS ${visited.size}`;
    ui.hint.textContent=room.d===0?'Find the chest. Claim your first weapon.':room.boss?'A powerful presence fills this room.':room.enemies.length?'Clear the room or slip past the creatures.':'The room is quiet. Keep exploring.';
    if(entrance) say(room.boss?'A BOSS STIRS IN THE DARK':`DEPTH ${room.d}`);
  }
  function start(){rooms.clear();opened.clear();keys.clear();visited=new Set();deepest=0;shards=0;player=freshPlayer();running=true;paused=false;touchMove.x=touchMove.y=0;ui.menu.classList.add('hidden');ui.game.classList.remove('hidden');closeModal();setRoom(0,0);updateHud();lastFrame=performance.now();}
  function say(message,time=1900){ui.toast.textContent=message;ui.toast.classList.add('show');toastUntil=performance.now()+time;}
  function updateHud(){ui.hp.style.width=(player.hp/player.maxHp*100)+'%';ui.en.style.width=(player.energy/player.maxEnergy*100)+'%';ui.hpText.textContent=`${Math.ceil(player.hp)} / ${player.maxHp}`;ui.enText.textContent=`${Math.ceil(player.energy)} / ${player.maxEnergy}`;ui.shards.textContent=`✦ ${shards}`;}
  function showModal(html){paused=true;touchMove.x=touchMove.y=0;keys.delete('b');ui.content.innerHTML=html;ui.modal.classList.remove('hidden');}
  function closeModal(){ui.modal.classList.add('hidden');paused=false;}
  function guide(){showModal(`<h2 id="modalTitle">FIELD GUIDE</h2><p>Grab the chest in front of you, then choose a door. Each room is a quick new encounter. Bosses wait at depths 5, 10, 15 and beyond.</p><div class="guide-grid"><div class="guide-row"><kbd>W A S D<br>↑ ← ↓ →</kbd> Move</div><div class="guide-row"><kbd>CLICK</kbd> Swing your weapon</div><div class="guide-row"><kbd>E</kbd> Open chests / collect drops</div><div class="guide-row"><kbd>B</kbd> Hold to block; costs energy</div><div class="guide-row"><kbd>H</kbd> Drink a healing flask</div><div class="guide-row"><kbd>Q</kbd> Use your special item</div><div class="guide-row"><kbd>I</kbd> Open inventory</div><div class="guide-row"><kbd>P</kbd> Spend shards in the shop</div><div class="guide-row"><kbd>DOORS</kbd> Walk through to explore</div></div><p>Enemies have health bars. Every defeat drops shards, and some drop healing. Spend shards on stronger weapons, specials, and healing flasks. Your three inventory slots hold one weapon, one heal, and one special item. Death empties your gear and shards. Chests reset with fresh loot each run. On mobile, walk near shards to collect them automatically.</p><div class="modal-actions"><button class="button primary" data-action="${running?'close':'play'}">${running?'BACK TO GAME':'PLAY NOW'}</button></div>`);}
  function inventory(){if(!running)return;const slots=[['weapon','⚔','WEAPON'],['heal','✚','HEAL'],['special','✦','SPECIAL']];showModal(`<h2 id="modalTitle">INVENTORY</h2><div class="stat-line"><span>DEPTH ${room.d}</span><span>DEEPEST ${deepest}</span><span>SHARDS ${shards}</span></div><p>Three slots. One item of each kind.</p>${slots.map(([kind,icon,label])=>{const item=player[kind];return `<div class="slot"><span class="slot-icon">${icon}</span><div><strong>${label}: ${item?item.name:'EMPTY'}</strong><small>${item?itemDesc(item):'Search chests and collect enemy drops.'}</small></div><button class="slot-help" data-help="${kind}">HOW TO USE</button></div>`}).join('')}<div class="modal-actions"><button class="button primary" data-action="close">CONTINUE</button><button class="button secondary" data-action="guide">FULL GUIDE</button></div>`);}
  function itemDesc(item){if(item.kind==='weapon')return `${item.damage} damage · click to attack · 0.48 second cooldown`;if(item.kind==='heal')return `Restores ${item.power} HP · press H · ${item.uses} use${item.uses>1?'s':''} left`;return `Press Q for a burst around you · ${item.tier*13+24} damage · single use`;}
  function help(kind){const item=player[kind];let description=kind==='weapon'?'Face an enemy and click to swing. The first chest gives you a weapon. You can still punch if you lose it.':kind==='heal'?'Press H or tap HEAL to recover health. You can carry one flask type with up to three uses.':'Press Q or tap ITEM to unleash a burst that damages nearby enemies. Special items are used once.';showModal(`<h2 id="modalTitle">${kind.toUpperCase()}</h2><p>${description}</p><p>${item?`Held: <strong>${item.name}</strong>. ${itemDesc(item)}`:'Your slot is empty.'}</p><div class="modal-actions"><button class="button primary" data-action="inventory">BACK TO INVENTORY</button></div>`);}
  function canBuy(offer){const held=player[offer.kind];if(shards<offer.price)return false;if(offer.kind==='heal')return !held||offer.power>held.power||(offer.power===held.power&&held.uses<3);return !held||offer.tier>held.tier;}
  function shop(){if(!running)return;showModal(`<h2 id="modalTitle">SHARD SHOP</h2><p class="shop-balance">✦ ${shards} SHARDS</p><p>Buy stronger gear as you explore. A stronger item replaces the one in its slot. Matching flasks add one use, up to three.</p>${['heal','special','weapon'].map(kind=>`<h3>${kind==='heal'?'HEALING FLASKS':kind==='special'?'SPECIAL ITEMS':'WEAPONS'}</h3>${shopItems.filter(offer=>offer.kind===kind).map(offer=>{const item=shopItem(offer);const held=player[kind];const reason=shards<offer.price?'NEED SHARDS':kind==='heal'&&held&&offer.power<held.power||kind!=='heal'&&held&&offer.tier<=held.tier?'OWN BETTER':kind==='heal'&&held&&offer.power===held.power&&held.uses>=3?'FULL':'BUY';return `<div class="shop-row"><div><strong>${item.name}${kind==='special'?` · TIER ${offer.tier}`:''}</strong><small>${kind==='heal'?`Restores ${item.power} HP · 1 use`:kind==='special'?`${item.tier*13+24} burst damage · single use`:`${item.damage} attack damage`}</small></div><button data-buy="${offer.id}" ${canBuy(offer)?'':'disabled'}>${reason} · ✦ ${offer.price}</button></div>`}).join('')}`).join('')}<div class="modal-actions"><button class="button primary" data-action="close">BACK TO GAME</button></div>`);}
  function buy(id){const offer=shopItems.find(item=>item.id===id);if(!offer||!running||!canBuy(offer))return;const item=shopItem(offer);shards-=offer.price;const held=player[offer.kind];if(offer.kind==='heal'&&held&&held.power===item.power)held.uses++;else player[offer.kind]=item;updateHud();shop();say(`BOUGHT ${item.name.toUpperCase()}`);}
  function death(){running=false;opened.clear();keys.clear();touchMove.x=touchMove.y=0;player.weapon=null;player.heal=null;player.special=null;showModal(`<h2 id="modalTitle" class="death-title">YOU FELL</h2><p>The dungeon claimed your gear. Every chest resets for your next run, with fresh loot waiting in the halls.</p><div class="stat-line"><span>DEEPEST ${deepest}</span><span>ROOMS ${visited.size}</span><span>SHARDS ${shards}</span></div><div class="modal-actions"><button class="button primary" data-action="play">TRY AGAIN</button><button class="button secondary" data-action="menu">TITLE SCREEN</button></div>`);}
  function pickup(item){
    if(item.kind==='weapon'){if(!player.weapon||item.tier>=player.weapon.tier){player.weapon=item;say(`EQUIPPED ${item.name.toUpperCase()}`);}else{shards+=3;say('WEAKER BLADE SALVAGED · +3 SHARDS');}}
    else if(item.kind==='heal'){if(player.heal&&player.heal.power===item.power){player.heal.uses=Math.min(3,player.heal.uses+1);say('HEALING FLASK REFILLED');}else if(!player.heal||item.power>player.heal.power){player.heal=item;say(`${item.name.toUpperCase()} ADDED`);}else{shards+=3;say('WEAKER FLASK SALVAGED · +3 SHARDS');}}
    else if(!player.special||item.tier>=player.special.tier){player.special=item;say(`${item.name.toUpperCase()} ADDED`);}else{shards+=3;say('WEAKER RELIC SALVAGED · +3 SHARDS');}
  }
  function openChest(){
    const k=keyOf(px,py);if(opened.has(k)){say('THIS CHEST IS EMPTY');return;}
    // Keep the entry chest useful while varying its starter weapon each run.
    const loot=room.d===0
      ? [weapon(0),{...weapon(0),name:'Worn Saber',damage:14},{...weapon(0),name:'Chipped Axe',damage:17}]
      : [weapon(clamp(Math.floor(room.d/4),0,4)),heal(),relic(clamp(Math.floor(room.d/5)+1,1,4))];
    const choices=loot.filter(item=>item.name!==previousChestLoot.get(k));
    const item=choices[Math.floor(Math.random()*choices.length)];
    opened.add(k);previousChestLoot.set(k,item.name);pickup(item);
    room.drops.push({x:room.chest.x+22,y:room.chest.y+16,kind:'shard',value:2});
  }
  function collectNearbyShards(){
    let collected=0;
    for(let i=room.drops.length-1;i>=0;i--){const drop=room.drops[i];if(drop.kind==='shard'&&dist(player,drop)<52){collected+=drop.value;room.drops.splice(i,1);}}
    if(collected){shards+=collected;say(`+${collected} SHARDS`);}
  }
  function interact(){if(!running||paused)return;const chest=room.chest;if(room.chestExists&&Math.hypot(player.x-chest.x,player.y-chest.y)<67&&!opened.has(keyOf(px,py))){openChest();return;}let nearest=null,best=52;for(const drop of room.drops){let d=dist(player,drop);if(d<best){nearest=drop;best=d;}}if(nearest){room.drops.splice(room.drops.indexOf(nearest),1);if(nearest.kind==='shard'){shards+=nearest.value;say(`+${nearest.value} SHARDS`);}else pickup(nearest.item);}else say('NOTHING TO PICK UP',900);}
  function useHeal(){if(!running||paused)return;if(!player.heal){say('NO HEALING FLASK');return;}if(player.hp>=player.maxHp){say('HEALTH ALREADY FULL');return;}const restored=Math.min(player.heal.power,player.maxHp-player.hp);player.hp+=restored;player.heal.uses--;if(player.heal.uses<=0)player.heal=null;updateHud();say(`+${Math.ceil(restored)} HEALTH`);}
  function useSpecial(){if(!running||paused)return;if(!player.special){say('NO SPECIAL ITEM');return;}let item=player.special;player.special=null;let hits=0;for(const enemy of [...room.enemies])if(dist(player,enemy)<135){hitEnemy(enemy,item.tier*13+24);hits++;}player.energy=Math.min(100,player.energy+22);swingUntil=performance.now()+330;swingAngle=player.facing;say(hits?`STARFIRE HIT ${hits} ENEM${hits===1?'Y':'IES'}`:'STARFIRE BURST · +22 ENERGY');}
  function hitEnemy(enemy,damage){enemy.hp-=damage;enemy.flash=performance.now()+150;if(enemy.hp<=0){room.enemies.splice(room.enemies.indexOf(enemy),1);const value=enemy.boss?18+room.d:2+Math.floor(room.d/3);room.drops.push({x:enemy.x,y:enemy.y,kind:'shard',value});if(enemy.boss){room.drops.push({x:enemy.x-27,y:enemy.y+25,kind:'item',item:weapon(clamp(2+Math.floor(room.d/5),0,4))});room.drops.push({x:enemy.x+27,y:enemy.y+25,kind:'item',item:relic(clamp(Math.floor(room.d/5)+1,1,4))});say('BOSS VANQUISHED · RARE LOOT!');}else if(Math.random()<.32){room.drops.push({x:enemy.x+23,y:enemy.y+10,kind:'item',item:heal()});say('ENEMY DEFEATED · LOOT DROPPED');}else say('ENEMY DEFEATED · LOOT DROPPED');if(!room.enemies.length)ui.hint.textContent='The room is quiet. Gather loot or keep exploring.';}}
  function attack(targetX,targetY,auto=false){if(!running||paused)return;const now=performance.now();if(now<player.nextAttack)return;player.nextAttack=now+480;let angle=Math.atan2(targetY-player.y,targetX-player.x);if(auto&&room.enemies.length){let e=[...room.enemies].sort((a,b)=>dist(player,a)-dist(player,b))[0];angle=Math.atan2(e.y-player.y,e.x-player.x);}player.facing=angle;swingAngle=angle;swingUntil=now+155;let hit=false;for(const enemy of [...room.enemies]){let d=dist(player,enemy);let a=Math.atan2(enemy.y-player.y,enemy.x-player.x);let delta=Math.atan2(Math.sin(a-angle),Math.cos(a-angle));if(d<(player.weapon?83:52)+enemy.r&&Math.abs(delta)<1.05){hitEnemy(enemy,player.weapon?player.weapon.damage:5);hit=true;}}if(!hit&&room.enemies.length&&Math.min(...room.enemies.map(e=>dist(player,e)))>110)say('MOVE CLOSER TO ATTACK',850);}
  function tryMove(dx,dy){let nx=player.x+dx,ny=player.y+dy;const doorX=ny>238&&ny<362,doorY=nx>403&&nx<557;
    if(nx<30&&doorX){setRoom(px-1,py,'left');return;}if(nx>930&&doorX){setRoom(px+1,py,'right');return;}if(ny<30&&doorY){setRoom(px,py-1,'up');return;}if(ny>570&&doorY){setRoom(px,py+1,'down');return;}
    if((nx<59||nx>901)&&!doorX)nx=clamp(nx,59,901);if((ny<59||ny>541)&&!doorY)ny=clamp(ny,59,541);nx=clamp(nx,18,942);ny=clamp(ny,18,582);
    if(room.chestExists&&Math.hypot(nx-room.chest.x,ny-room.chest.y)<27){let angle=Math.atan2(ny-room.chest.y,nx-room.chest.x);nx=room.chest.x+Math.cos(angle)*27;ny=room.chest.y+Math.sin(angle)*27;}
    player.x=nx;player.y=ny;
  }
  function update(dt,now){if(!running||paused)return;
    const vx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+touchMove.x;
    const vy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+touchMove.y;
    if(vx||vy){let length=Math.max(1,Math.hypot(vx,vy));tryMove(vx/length*205*dt,vy/length*205*dt);player.facing=Math.atan2(vy,vx);}
    player.energy=Math.min(player.maxEnergy,player.energy+17*dt);
    player.blocking=keys.has('b');
    for(const e of room.enemies){const d=dist(player,e);if(d>e.r+19&&d<460){const speed=e.boss?67:e.alien?98:75;e.x+=(player.x-e.x)/d*speed*dt;e.y+=(player.y-e.y)/d*speed*dt;}
      if(d<e.r+22&&now>e.hitAt&&now>player.invuln){e.hitAt=now+(e.boss?820:1100);if(player.blocking){if(player.energy>=27){player.energy-=27;say('BLOCKED · -27 ENERGY',700);}else{say('NOT ENOUGH ENERGY',1100);takeDamage(e.boss?20: e.alien?12:15,now);}}else takeDamage(e.boss?20:e.alien?12:15,now);}}
    if(!running)return;
    if(mobileControls.matches)collectNearbyShards();
    const action=mobileControls.matches?'[ OPEN ]':'[ E ]';
    let prompt='';if(room.chestExists&&!opened.has(keyOf(px,py))&&dist(player,room.chest)<75)prompt=`${action} OPEN CHEST`;else {let nearest=room.drops.find(d=>dist(player,d)<58&&(!mobileControls.matches||d.kind!=='shard'));if(nearest)prompt=nearest.kind==='shard'?'[ E ] COLLECT SHARDS':`${action} PICK UP ${nearest.item.name.toUpperCase()}`;}ui.prompt.textContent=prompt;ui.prompt.classList.toggle('hidden',!prompt);updateHud();}
  function takeDamage(amount,now){player.hp=Math.max(0,player.hp-amount);player.invuln=now+620;say(`-${amount} HEALTH`,700);if(player.hp<=0)death();}
  function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  function textDraw(s,x,y,size=12,color='#eee5cc',align='center'){ctx.font=`bold ${size}px monospace`;ctx.textAlign=align;ctx.fillStyle='#070908';ctx.fillText(s,x+2,y+2);ctx.fillStyle=color;ctx.fillText(s,x,y);}
  function drawFloor(){rect(0,0,W,H,'#252c27');for(let ty=0;ty<10;ty++)for(let tx=0;tx<16;tx++){const n=hash(px*23+tx,py*29+ty,17);rect(tx*60+2,ty*60+2,56,56,['#28312b','#2b332d','#30362e','#273029'][n%4]);rect(tx*60+5,ty*60+5,3,3,'#3a4035');if(n%6===0){rect(tx*60+34,ty*60+42,17,2,'#1c241e');rect(tx*60+42,ty*60+38,2,5,'#1c241e');}if(n%13===0){rect(tx*60+17,ty*60+24,4,4,'#536047');}}
    const glow=ctx.createRadialGradient(player.x,player.y,35,player.x,player.y,500);glow.addColorStop(0,'#d6ad4212');glow.addColorStop(1,'#080e0a8c');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
  }
  function drawWalls(){const wall='#485044',edge='#69715d',dark='#171e19';rect(0,0,405,45,wall);rect(555,0,405,45,wall);rect(0,555,405,45,wall);rect(555,555,405,45,wall);rect(0,0,45,240,wall);rect(0,360,45,240,wall);rect(915,0,45,240,wall);rect(915,360,45,240,wall);
    rect(0,44,405,5,edge);rect(555,44,405,5,edge);rect(0,550,405,5,edge);rect(555,550,405,5,edge);rect(43,0,5,240,edge);rect(43,360,5,240,edge);rect(912,0,5,240,edge);rect(912,360,5,240,edge);
    for(let i=0;i<16;i++){let x=i*60;rect(x+2,8,48,2,'#323b32');rect(x+12,578,39,2,'#303a32');}for(let i=0;i<10;i++){rect(8,i*60+9,2,41,'#303a32');rect(947,i*60+6,2,43,'#303a32');}
    rect(406,0,148,26,dark);rect(406,574,148,26,dark);rect(0,241,26,118,dark);rect(934,241,26,118,dark);
    textDraw('▴',480,28,27,'#c4a265');textDraw('▾',480,591,27,'#c4a265');textDraw('◂',17,306,27,'#c4a265');textDraw('▸',944,306,27,'#c4a265');
  }
  function drawTorch(x,y,t){const flicker=Math.sin(t/140+x)*3;const g=ctx.createRadialGradient(x,y-12,2,x,y-12,105);g.addColorStop(0,'#e8a44942');g.addColorStop(1,'#e8a44900');ctx.fillStyle=g;ctx.fillRect(x-105,y-115,210,210);rect(x-5,y,10,22,'#563e25');rect(x-11,y+20,22,5,'#241d16');rect(x-7,y-13,14,15,'#e68c3c');rect(x-4,y-20+flicker,8,19,'#ffd277');rect(x-2,y-13,4,10,'#fff2a2');}
  function drawChest(t){if(!room.chestExists)return;const c=room.chest,open=opened.has(keyOf(px,py));rect(c.x-18,c.y-7,36,25,'#27190f');rect(c.x-16,c.y-10,32,20,open?'#533a27':'#8a5b2d');rect(c.x-16,c.y-10,32,4,open?'#3f2e23':'#bd8743');rect(c.x-11,c.y-8,4,19,'#d5af60');rect(c.x+8,c.y-8,4,19,'#d5af60');rect(c.x-3,c.y-1,6,8,open?'#473a2a':'#eed276');if(open){rect(c.x-16,c.y-18,32,5,'#573a25');rect(c.x-16,c.y-18,3,9,'#d3ad5f');}else{let glow=Math.sin(t/300)*.2+.4;ctx.globalAlpha=glow;rect(c.x-3,c.y-21,6,5,'#f1d27c');ctx.globalAlpha=1;}}
  function drawDrops(t){for(const drop of room.drops){const bob=Math.sin(t/230+drop.x)*3;if(drop.kind==='shard'){rect(drop.x-5,drop.y-8+bob,10,14,'#eeb85a');rect(drop.x-2,drop.y-5+bob,4,5,'#fff1a3');}else{const color=drop.item.color;rect(drop.x-9,drop.y-10+bob,18,18,'#101611');rect(drop.x-7,drop.y-8+bob,14,14,color);textDraw(drop.item.kind==='weapon'?'⚔':drop.item.kind==='heal'?'+':'✦',drop.x,drop.y+4+bob,15,'#fff5db');}}}
  function drawEnemy(e,t){let c=e.boss?'#9b5554':e.alien?'#75a6a0':'#8e9b60';if(e.flash>t)c='#fff0c6';const x=Math.round(e.x),y=Math.round(e.y),r=e.r;rect(x-r,y-r+7,r*2,r*2-6,'#111712');rect(x-r+3,y-r+3,r*2-6,r*2-5,c);if(e.boss){rect(x-r-8,y-r-8,12,15,'#bd7860');rect(x+r-4,y-r-8,12,15,'#bd7860');rect(x-9,y-1,6,5,'#ffdf85');rect(x+3,y-1,6,5,'#ffdf85');}else if(e.alien){rect(x-r-5,y-r+8,8,10,c);rect(x+r-3,y-r+8,8,10,c);rect(x-7,y-1,5,5,'#baf4f1');rect(x+3,y-1,5,5,'#baf4f1');}else{rect(x-9,y-2,5,4,'#eedc80');rect(x+4,y-2,5,4,'#eedc80');rect(x-3,y+8,6,3,'#3f4935');}
    const width=e.boss?67:46;rect(x-width/2-1,y-r-20,width+2,8,'#0c110d');rect(x-width/2,y-r-19,width*clamp(e.hp/e.maxHp,0,1),6,e.boss?'#d96b62':'#98cf79');}
  function drawPlayer(t){const x=Math.round(player.x),y=Math.round(player.y),flash=player.invuln>t&&Math.floor(t/75)%2===0;if(flash)ctx.globalAlpha=.5;rect(x-12,y+9,24,8,'#101511');rect(x-10,y-13,20,27,'#506b82');rect(x-8,y-15,16,12,'#d9c6a1');rect(x-6,y-14,12,6,'#463d32');rect(x-9,y+9,7,7,'#2e3431');rect(x+2,y+9,7,7,'#2e3431');rect(x-6,y-2,4,4,'#1c2929');rect(x+3,y-2,4,4,'#1c2929');if(player.weapon){const wx=x+Math.cos(player.facing)*18,wy=y+Math.sin(player.facing)*18;rect(wx-3,wy-8,6,17,player.weapon.color);}if(player.blocking){ctx.strokeStyle='#8cc8ea';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,23,0,TAU);ctx.stroke();}if(swingUntil>t){ctx.strokeStyle=player.weapon?'#f3dc9b':'#d5d6c5';ctx.lineWidth=7;ctx.beginPath();ctx.arc(x,y,player.weapon?47:30,swingAngle-.8,swingAngle+.8);ctx.stroke();}ctx.globalAlpha=1;}
  function render(t){if(!running)return;drawFloor();drawWalls();drawTorch(125,45,t);drawTorch(835,45,t);drawTorch(125,555,t);drawTorch(835,555,t);drawChest(t);drawDrops(t);for(const e of room.enemies)drawEnemy(e,t);drawPlayer(t);if(player.invuln>t){ctx.fillStyle='#f2512912';ctx.fillRect(0,0,W,H);}}
  function frame(now){const dt=clamp((now-lastFrame)/1000,0,.05);lastFrame=now;if(running){update(dt,now);render(now);}if(toastUntil&&now>toastUntil){ui.toast.classList.remove('show');toastUntil=0;}requestAnimationFrame(frame);}
  $('playButton').addEventListener('click',start);$('guideButton').addEventListener('click',guide);$('inventoryButton').addEventListener('click',inventory);$('shopButton').addEventListener('click',shop);$('menuButton').addEventListener('click',()=>showModal(`<h2 id="modalTitle">PAUSED</h2><p>Take a breath. The dungeon will wait.</p><div class="modal-actions"><button class="button primary" data-action="close">CONTINUE</button><button class="button secondary" data-action="shop">SHOP</button><button class="button secondary" data-action="guide">GUIDE</button><button class="button secondary" data-action="menu">TITLE SCREEN</button></div>`));$('closeModal').addEventListener('click',closeModal);
  ui.modal.addEventListener('click',e=>{if(e.target===ui.modal){closeModal();return;}const buyId=e.target.closest('[data-buy]')?.dataset.buy,action=e.target.closest('[data-action]')?.dataset.action,kind=e.target.closest('[data-help]')?.dataset.help;if(buyId){buy(buyId);return;}if(kind){help(kind);return;}if(action==='close')closeModal();if(action==='play')start();if(action==='guide')guide();if(action==='inventory')inventory();if(action==='shop')shop();if(action==='menu'){running=false;closeModal();ui.game.classList.add('hidden');ui.menu.classList.remove('hidden');}});
  window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' ','b','e','h','q','i','p','w','a','s','d'].includes(k))e.preventDefault();if(k==='escape'&&!ui.modal.classList.contains('hidden')){closeModal();return;}if(!running||paused)return;keys.add(k);if(e.repeat)return;if(k==='e')interact();if(k==='h')useHeal();if(k==='q')useSpecial();if(k==='i')inventory();if(k==='p')shop();if(k===' ')attack(player.x+Math.cos(player.facing)*100,player.y+Math.sin(player.facing)*100,true);});
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();touchMove.x=touchMove.y=0;resetJoystick();});
  canvas.addEventListener('pointerdown',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();attack((e.clientX-r.left)/r.width*W,(e.clientY-r.top)/r.height*H,e.pointerType==='touch');});
  const joystick=$('touchJoystick'), knob=$('joystickKnob');
  let joystickPointer=null;
  function resetJoystick(){joystickPointer=null;touchMove.x=touchMove.y=0;knob.style.transform='translate(0px, 0px)';}
  function moveJoystick(e){
    const rect=joystick.getBoundingClientRect(), radius=rect.width*.32;
    let x=e.clientX-(rect.left+rect.width/2), y=e.clientY-(rect.top+rect.height/2);
    const distance=Math.hypot(x,y), scale=distance>radius?radius/distance:1;
    x*=scale;y*=scale;
    knob.style.transform=`translate(${x}px, ${y}px)`;
    const strength=Math.hypot(x,y)/radius;
    touchMove.x=strength<.14?0:x/radius;
    touchMove.y=strength<.14?0:y/radius;
  }
  joystick.addEventListener('pointerdown',e=>{if(joystickPointer!==null)return;e.preventDefault();joystickPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);moveJoystick(e);});
  joystick.addEventListener('pointermove',e=>{if(e.pointerId===joystickPointer){e.preventDefault();moveJoystick(e);}});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(event,e=>{if(e.pointerId===joystickPointer)resetJoystick();});
  $('touchAttack').addEventListener('pointerdown',e=>{e.preventDefault();attack(player.x+100,player.y,true);});$('touchInteract').addEventListener('pointerdown',e=>{e.preventDefault();interact();});$('touchHeal').addEventListener('pointerdown',e=>{e.preventDefault();useHeal();});$('touchSpecial').addEventListener('pointerdown',e=>{e.preventDefault();useSpecial();});
  const block=$('touchBlock');block.addEventListener('pointerdown',e=>{e.preventDefault();block.setPointerCapture(e.pointerId);keys.add('b');});for(const event of ['pointerup','pointercancel','lostpointercapture'])block.addEventListener(event,()=>keys.delete('b'));
  requestAnimationFrame(frame);
})();
