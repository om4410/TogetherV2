const express=require("express");
const http=require("http");
const path=require("path");
const PUBLIC_DIR=path.join(__dirname,"public");
const {Server}=require("socket.io");

const app=express(), server=http.createServer(app), io=new Server(server);
const PORT=process.env.PORT||3000, rooms=new Map();
const pink="#ff2fd6", green="#39ff8c";
function cleanRoom(v){try{const u=new URL(v);v=u.searchParams.get("room")||v}catch(e){}return String(v||"").replace(/[^A-Za-z0-9_-]/g,"").slice(0,24).toUpperCase()}

function getRoom(id){
  if(!rooms.has(id)) rooms.set(id,{videoId:null,title:"",playing:false,position:0,updatedAt:Date.now(),users:new Map(),queue:[],messages:[],history:[],hostId:null,votes:new Map()});
  return rooms.get(id);
}
function nowPos(r){return Math.max(0,r.position+(r.playing?(Date.now()-r.updatedAt)/1000:0))}
function snapshot(r,extra={}){const users=[...r.users.values()].map(u=>({...u,myVote:0}));return {videoId:r.videoId,title:r.title||"",playing:r.playing,position:nowPos(r),serverNow:Date.now(),users,hostId:r.hostId,queue:r.queue,messages:r.messages.slice(-80),history:r.history.slice(-20),...extra}}
function emitRoom(id){const r=getRoom(id);for(const sid of r.users.keys()){const users=[...r.users.values()].map(u=>{const vote=r.votes.get(`${sid}:${u.id}`)||0;return {...u,myVote:vote}});io.to(sid).emit("state",{...snapshot(r),users});}}
function isHost(s){const id=s.data.room; return !!id && getRoom(id).hostId===s.id}

io.on("connection",s=>{
  s.on("join",({room:requestedRoom,name,avatar})=>{
    const room=cleanRoom(requestedRoom);
    name=String(name||"Guest").trim().slice(0,24)||"Guest";
    if(!room)return;
    s.data.room=room;s.data.name=name;s.join(room);
    const r=getRoom(room);
    const isFirstUser=r.users.size===0;
    r.users.set(s.id,{id:s.id,name,avatar:avatar||"●",online:true,host:isFirstUser,color:Math.random()>.5?pink:green,joinedAt:Date.now(),vibe:0,upvotes:0,downvotes:0,myVote:0});
    if(isFirstUser) r.hostId=s.id;
    s.emit("state",snapshot(r));
    s.to(room).emit("notice",{text:`${name} joined the room`,type:"join"});
    emitRoom(room);
  });
  s.on("load",({videoId,title})=>{
    const id=s.data.room;if(!id||!isHost(s)||!/^[A-Za-z0-9_-]{11}$/.test(videoId))return;
    const r=getRoom(id);if(r.videoId&&r.videoId!==videoId) r.history.push({videoId:r.videoId,title:r.title||"YouTube track"});r.videoId=videoId;r.title=String(title||"YouTube track").slice(0,100);r.position=0;r.playing=false;r.updatedAt=Date.now();emitRoom(id);
  });
  s.on("play",pos=>{const id=s.data.room;if(!id||!isHost(s))return;const r=getRoom(id);const executeAt=Date.now()+180;r.position=+pos||0;r.playing=true;r.updatedAt=executeAt;snapshot(r,{sourceId:s.id,executeAt,action:"play"});io.to(id).emit("playback",snapshot(r,{sourceId:s.id,executeAt,action:"play"}));});
  s.on("pause",pos=>{const id=s.data.room;if(!id||!isHost(s))return;const r=getRoom(id);const executeAt=Date.now()+180;r.position=+pos||0;r.playing=false;r.updatedAt=executeAt;io.to(id).emit("playback",snapshot(r,{sourceId:s.id,executeAt,action:"pause"}));});
  s.on("seek",pos=>{const id=s.data.room;if(!id||!isHost(s))return;const r=getRoom(id);const executeAt=Date.now()+120;r.position=+pos||0;r.updatedAt=executeAt;io.to(id).emit("playback",snapshot(r,{sourceId:s.id,executeAt,action:"seek"}));});
  s.on("sync:request",()=>{const id=s.data.room;if(!id)return;io.to(s.id).emit("playback",snapshot(getRoom(id),{executeAt:Date.now()+80,action:"sync"}));});
  s.on("queue:add",q=>{const id=s.data.room;if(!id||!/^[A-Za-z0-9_-]{11}$/.test(q.videoId))return;getRoom(id).queue.push({videoId:q.videoId,title:String(q.title||"YouTube track").slice(0,100),by:s.data.name});emitRoom(id);});
  s.on("queue:remove",i=>{const id=s.data.room,r=id&&getRoom(id);if(r&&r.queue[i]){r.queue.splice(i,1);emitRoom(id)}});
  s.on("next",()=>{const id=s.data.room;if(!id||!isHost(s))return;const r=getRoom(id);if(!r||!r.queue.length)return;if(r.videoId)r.history.push({videoId:r.videoId,title:r.title||"YouTube track"});const q=r.queue.shift();r.videoId=q.videoId;r.title=q.title;r.position=0;r.playing=false;r.updatedAt=Date.now();emitRoom(id)});
  s.on("previous",()=>{const id=s.data.room;if(!id||!isHost(s))return;const r=getRoom(id);if(!r||!r.history.length)return;if(r.videoId)r.queue.unshift({videoId:r.videoId,title:r.title||"YouTube track",by:"Previous"});const q=r.history.pop();r.videoId=q.videoId;r.title=q.title;r.position=0;r.playing=false;r.updatedAt=Date.now();emitRoom(id)});
  s.on("chat",msg=>{const id=s.data.room,r=id&&getRoom(id);if(!r)return;msg=String(msg||"").trim().slice(0,400);if(!msg)return;r.messages.push({name:s.data.name,text:msg,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),color:r.users.get(s.id)?.color||green});emitRoom(id)});
  s.on("vibe:vote",({targetId,direction})=>{const id=s.data.room,r=id&&getRoom(id);if(!r||!r.users.has(targetId))return;direction=Number(direction);if(![1,-1].includes(direction))return;const key=`${s.id}:${targetId}`,previous=r.votes.get(key)||0;if(previous===direction){r.votes.delete(key);direction=0}else{r.votes.set(key,direction)}const target=r.users.get(targetId);target.vibe=(target.vibe||0)-previous+direction;target.upvotes=Math.max(0,(target.upvotes||0)-(previous===1?1:0)+(direction===1?1:0));target.downvotes=Math.max(0,(target.downvotes||0)-(previous===-1?1:0)+(direction===-1?1:0));emitRoom(id)});
  s.on("disconnect",()=>{const id=s.data.room;if(!id||!rooms.has(id))return;const r=rooms.get(id),u=r.users.get(s.id);r.users.delete(s.id);
    if(u)s.to(id).emit("notice",{text:`${u.name} left the room`,type:"leave"});
    for(const [key,vote] of [...r.votes.entries()]){const [voterId,targetId]=key.split(":");if(voterId===s.id){const target=r.users.get(targetId);if(target){if(vote===1)target.upvotes=Math.max(0,(target.upvotes||0)-1);if(vote===-1)target.downvotes=Math.max(0,(target.downvotes||0)-1);target.vibe=(target.vibe||0)-vote;}r.votes.delete(key)}else if(targetId===s.id){r.votes.delete(key)}}
    if(r.hostId===s.id){
      const next=r.users.values().next().value;
      r.hostId=next?.id||null;
      if(next){next.host=true;io.to(next.id).emit("notice",{text:"You are now the host.",type:"host"});}
    }
    if(r.users.size===0){rooms.delete(id);return;}
    emitRoom(id);});
});

app.get("/api/search",async(req,res)=>{
  const q=String(req.query.q||"").trim().slice(0,100);
  const key=process.env.YOUTUBE_API_KEY;
  if(!q)return res.status(400).json({error:"Enter a song or artist."});
  if(!key)return res.status(503).json({error:"YouTube search is not configured yet. Add YOUTUBE_API_KEY in Render Environment Variables."});
  try{
    const u=new URL("https://www.googleapis.com/youtube/v3/search");
    u.search=new URLSearchParams({part:"snippet",q,type:"video",maxResults:"8",regionCode:"IN",safeSearch:"moderate",videoEmbeddable:"true",videoSyndicated:"true",key});
    const r=await fetch(u); const data=await r.json();
    if(!r.ok)return res.status(r.status).json({error:data?.error?.message||"YouTube search failed"});
    res.json({items:(data.items||[]).map(x=>({videoId:x.id.videoId,title:x.snippet.title,channel:x.snippet.channelTitle,thumb:x.snippet.thumbnails?.medium?.url||x.snippet.thumbnails?.default?.url}))});
  }catch(e){res.status(500).json({error:"Search service error"})}
});

app.use(express.static(PUBLIC_DIR));
app.get("*splat",(req,res)=>res.sendFile(path.join(PUBLIC_DIR,"index.html")));
server.listen(PORT,()=>console.log("Together Neon running on port "+PORT));