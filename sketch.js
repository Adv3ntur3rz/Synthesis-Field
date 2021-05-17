/*
Creative Programming II


*Randiel Zoquier


*Synthesis Field

*/


let nodes = []; // an array to hold all the nodes
let control = -1; // a control variable to know which node to move or weather to create a new one
let erasing = false; //whether we are erasing nodes
let mobile; //change things if accessed on mobile

let maxNodeSize, minNodeSize; //sizes for nodes
let maxNodes = 8; // max number of concurrent nodes
let started = true; //keep track if audio is playing
let reverb; //reverb object (may impact performance)
let taskBarSize; //size of bottom and top bars that hold UI elements

let recording, recordButton, stopRecordButton; //recording things
let recorder, recordedFile; //^^ cont.

//C scale in MIDI numbers
let scale = [36, 38, 40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76,77, 79, 81, 83, 84, 86, 88, 89, 91, 93, 95, 96];

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB);

  recording = false;
  recordButton = document.getElementById("record");
  stopRecordButton = document.getElementById('stop');

  recorder = new p5.SoundRecorder();
  recordedFile = new p5.SoundFile();

  //media query
  if(window.matchMedia("(max-width: 1000px)").matches){
    mobile = true;
  }else{
    mobile = false;
  }

  //change globals depending on media
  if(mobile){
    taskBarSize = height *0.08;
    maxNodeSize = width * 0.15;
    minNodeSize = width * 0.05;
  }else{
    taskBarSize = height *0.05;
    maxNodeSize = width * 0.04;
    minNodeSize = width * 0.02;
    reverb = new p5.Reverb();
    reverb.set(5, 6);
    reverb.drywet(0.8);
  }

}

function draw() {
  background(0,0, 9);

  //lines
  noFill();
  strokeWeight(3);
  stroke(0, 0, 8);
  for(var l = 0; l < scale.length; l++){
    var interval = l * (height / scale.length);
    line(0, interval, width, interval);
  }

  //render nodes
  if(nodes.length > 0){
    for(node of nodes){
      node.updateSound();
      node.displayRing();
      node.displayPoint();
    }
  }

  //render UI
  ui();

}

// ___________________________________

//all the UI elements are built here
function ui(){
  actionSelector();

  //center
  noFill();
  stroke(0,0 , 100, 0.4);
  circle(width/2, height/2, height * 0.009);

  //taskbars
  noStroke();
  fill(0,0, 4);
  rect(0,0, width, taskBarSize);
  //bottom taskbar turns red during recording
  if(recording){
    fill(0, 80, 50);
  }else{
    fill(0,0, 4);
  }
  rect(0,height - taskBarSize, width, taskBarSize);

  //cursor
  noFill();

  //only render custom cursor if not on the taskbar and if on desktop
  if(!mobile){
    if(mouseY > taskBarSize && mouseY < height - taskBarSize){
      noCursor();
      if(!erasing){
        stroke(0, 0, 100);
        circle(mouseX, mouseY, height * 0.02);

        noStroke();
        fill(0, 0, 100);
        circle(mouseX, mouseY, height * 0.005);
      }else{
        stroke(349, 100, 56);
        circle(mouseX, mouseY, height * 0.02);

        noStroke();
        fill(349, 100, 56);
        circle(mouseX, mouseY, height * 0.005);
      }
    }else{
      cursor();
    }
  }


}

//switching between erasing and not
function actionSelector(){
  var add = document.getElementById('add');
  var eraseRadio = document.getElementById('eraseRadio');

  if(add.checked){
    erasing = false;
  }else if(eraseRadio.checked){
    erasing = true;
  }
}


//this is how we control synthesis and display. each node is its own syth with its own sound settings
class Node{

  constructor(startX, startY){
    this.x = startX;
    this.y = startY;
    this.closest = null; // used for calculating closest node for gravitation

    //calculating special mapping
    this.radial = dist(this.x, this.y, width/ 2, height / 2); //distance from center
    this.rotational = Math.abs(degrees(Math.atan2((this.y - (height/ 2)), (this.x - (width/2)))));
    //rotation around center axis (180 degrees from left to right)

    //nitial input mapping
    this.nodeSize = map(this.radial, abs(dist(0,0, width/2, height/2)), 0, minNodeSize, maxNodeSize);
    this.pan = map(this.x, 0, width, -0.9, 0.9);
    var scaleNote = scale[int(map(this.y, 0, height, scale.length, 0))];
    this.pitch = midiToFreq(scaleNote);
    this.amp = map(this.radial, abs(dist(0,0, width/2, height/2)), 0, 0, 0.5);

    //sound objects (oscillators)
    this.osc1 = new p5.Oscillator('sawtooth');
    this.osc2 = new p5.Oscillator('sawtooth');
    this.sub = new p5.Oscillator('square');
    //lfo
    this.lfo1 = new p5.Oscillator("sine");
    this.lfo2 = new p5.Oscillator("sine");
    //analysis and filter
    this.fft = new p5.FFT(0.9, 128);
    this.filter = new p5.LowPass();

    //disconnecting oscillators to connect to filters
    this.osc1.disconnect();
    this.osc2.disconnect();
    this.sub.disconnect();
    this.lfo1.disconnect();
    this.lfo2.disconnect();

    // lfo1: frequency modulation
    this.osc1.freq(this.lfo1);
    this.osc2.freq(this.lfo1);

    //lfo2: amplitude modulation
    this.osc1.amp(this.lfo2);
    this.osc2.amp(this.lfo2);
    //keep the sub not too loud
    this.sub.amp(0.6);

    //connect osc to filters
    this.osc1.connect(this.filter);
    this.osc2.connect(this.filter);
    this.sub.connect(this.filter);
    //set initial filter params
    this.filter.set(1000, 10);
    //only add reverb if not on mobile to save some processing power
    if(!mobile) this.filter.chain(reverb);

    //start the oscillators
    this.osc1.start();
    this.osc2.start();
    this.sub.start();
    this.lfo1.start();
    this.lfo2.start();

    //some failsafe to only start playing sound if in the "playing" state
    if(started) {
      this.playing = true;
    }else{
      this.playing = false;
      this.osc1.amp(0);
      this.osc2.amp(0);
      this.sub.amp(0);
    }

    //set the pitch based on initial params
    this.osc1.freq(this.pitch);
    this.osc2.freq(this.pitch * 1.006956); //slightly detuned
    this.sub.freq(this.pitch / 2); //octave below

    //set the input of the analyzer
    this.fft.setInput(this.filter);
  }

  //update the position
  move(newX, newY){
    this.x = newX;
    this.y = newY;

    //update mappings
    this.radial = dist(this.x, this.y, width/ 2, height / 2);
    this.rotational = Math.abs(degrees(Math.atan2((this.y - (height/ 2)), (this.x - (width/2)))));
    this.nodeSize = map(this.radial, abs(dist(0,0, width/2, height/2)), 0, minNodeSize, maxNodeSize);
    this.pan = map(this.x, 0, width, -0.9, 0.9);
    var scaleNote = scale[int(map(this.y, 0, height, scale.length, 0))];
    this.pitch = midiToFreq(scaleNote);
    this.amp = map(this.radial, abs(dist(0,0, width/2, height/2)), 0, 0, 0.5);
  }

  //change how the sound plays over time
  updateSound(){
    this.nearest(); //calculate the nearest node
    this.shift(); //move towards  nearest node


    if(this.playing){ //only make sounds if sound should be made
      this.osc1.freq(this.pitch, 0.5);
      this.osc2.freq(this.pitch * 1.006956, 0.5); //slightly detuned
      this.sub.freq(this.pitch / 2, 0.5); //an octave down

      //modulation
      this.lfo1.freq(map(this.rotational, 0, 180, 0.025, 3)); //speed of lfo1 mapped to rotation
      this.lfo2.freq(map(this.rotational, 0, 180, 0.05, 0.55)); //speed of lfo2 mapped to rotation

      this.lfo1.amp(map( Math.pow(this.x, 3) * (1/ width), -Math.pow(width, 3), Math.pow(width, 3), 0, 5)); //intensity of lfo1 mapped to cubic function based on x axis
      this.lfo2.amp(map(this.rotational, 180, 0, 0, 3)); //map the instsity of lfo2 based on rotation

      this.osc2.phase(lfo( 0.2, 1, 0.2) + 0.5); //adjust the phase of the second oscilator with an lfo for some fun shifting

      //pan the sounds
      this.osc1.pan(this.pan);
      this.osc2.pan(this.pan);
      this.sub.pan(this.pan);

      //double modulate the filter frequency, mapping the size of modulation to the pitch
      var lfoLfo = map(lfo(0.006, 1, 0.4), -1, 1, 0.01, 1.02);
      var filterLfo = lfo( lfoLfo,
        map(this.pitch, midiToFreq(36), midiToFreq(96), 20, 375),
        0);

      //also lower the filter the farther the note is from the center
      this.filter.freq(map(this.radial, Math.abs(dist(0,0, width/2, height/2)), 0, 150, 1700) + filterLfo);

      this.filter.amp(this.amp, 0.2);
    }else{
      //no sound when paused
      this.osc1.amp(0, 0.5);
      this.osc2.amp(0, 0.5);
      this.sub.amp(0, 0.5);

      this.lfo1.amp(0);
      this.lfo2.amp(0);
    }
    //update the waveform
    this.waveform = this.fft.waveform();
  }

  //display the control point
  displayPoint(){
    noFill();
    stroke(0,0 , 100);
    strokeWeight(3);

    //color mapped to rotation, alpha mapped to distance
    this.c = map(this.rotational, 0, 180, 150, 342);
    this.alpha = map(this.radial, Math.abs(dist(0,0, width/2, height/2)), 0, 0.2, 1);

    fill(this.c, 100, 75, this.alpha);
    noStroke();
    circle(this.x, this.y, this.nodeSize);
  }

  //display the warping ring
  displayRing(){

    var ringSize = map(this.radial, Math.abs(dist(0,0, width/2, height/2)), 0, height *0.01, height * 0.43);
    var ringDelta = map(this.radial, 0, Math.abs(dist(0,0, width/2, height/2)), height *0.05, height * 0.25);

    push();
      translate(width/ 2, height /2);
      rotate(map(lfo( 0.2, 1, 0.2), -1, 1, radians(0), radians(360)));

      strokeWeight(5);
      stroke(this.c, 100, 75, this.alpha);
      noFill();

      beginShape();
      for(var p = 0; p < this.waveform.length; p++){
        var x = map(this.waveform[p], -1, 1, ringSize - ringDelta,ringSize + ringDelta) * Math.cos(radians((360 /this.waveform.length) * p));
        var y = map(this.waveform[p], -1, 1, ringSize - ringDelta,ringSize + ringDelta) * Math.sin(radians((360 /this.waveform.length) * p));
        vertex(x,y);
      }
      endShape();
    pop();
  }

  //for pausing
  stop(){
    this.playing = false;
  }

  // for resuming
  start(){
    this.playing = true;
  }

  //for getting rid of the node
  kill(){
    this.osc1.stop();
    this.osc2.stop();
    this.sub.stop();
  }

  //calc nearest
  nearest(){
    var minDistance = width * 2;
    var tempClosest = null;

    if(nodes.length >= 2){
      for(var n of nodes){
        var distance = dist(this.x, this.y, n.x, n.y);
        if(distance === 0){
          continue;
        }
        if(distance < minDistance){
          minDistance = distance;
          tempClosest = n;
        }
      }
    }
    this.closest = tempClosest;
  }

  //move the node with gravitational pull
  shift(){
    var pos = createVector(this.x, this.y);
    if(this.closest != null){
      var nearDist = dist(this.closest.x, this.closest.y, this.x, this.y);
      if(nearDist< width *0.2 && nearDist > width * 0.05){
        var dir = p5.Vector.sub(pos, createVector(this.closest.x, this.closest.y));
        dir.normalize();
        dir.mult(0.025);
        pos.sub(dir);
        this.move(pos.x, pos.y);
      }
    }
  }
}

// ___________________________________

function windowResized(){
  setup();
}

//for pausing and playing
function keyPressed(){
  if(keyCode == 32){

    if(started){
      for(node of nodes){
        node.stop();
      }
      started = false;
    }else{
      for(node of nodes){
        node.start();
      }
      started = true;
    }
  }
}

// input events
function mousePressed(){
  //only if not around the taskBar
  if( mouseY > taskBarSize && mouseY < height - taskBarSize){
    if(!erasing){
      nodeClicked(mouseX, mouseY);
    }else if(erasing){
      removeNode(mouseX, mouseY);
    }
  }
}

function mouseDragged(){
  if( mouseY > taskBarSize){
    moveNode(mouseX, mouseY);
  }
}

function mouseReleased(){
  if(control != -1) control = -1;
}

// general input event functions
function nodeClicked(x,y){
  if(nodes.length > 0){

    for(var i = 0; i < nodes.length; i++){
      if(dist(x, y, nodes[i].x, nodes[i].y) < nodes[i].nodeSize + 2){
        control = i;
      }
    }
    if(control == -1 && nodes.length < maxNodes){
      nodes.push(new Node(x, y));
    }
  }else if(control == -1){
    nodes.push(new Node(x, y));
  }
}

function moveNode(x, y){
  if(control > -1){
    nodes[control].move(x, y);
  }
}

function removeNode(x,y){
  for(var i = 0; i < nodes.length; i++){
    if(dist(x, y, nodes[i].x, nodes[i].y) < nodes[i].nodeSize + 2){
      nodes[i].kill();
      nodes.splice(i, 1);
    }
  }
}

//custom lfo function
function lfo(rate, range, phase){
  var wave = 0;
    newRate = (Math.PI * 2) * (rate / 1000);
    newPhase = phase * (1/ newRate);
    wave = range * Math.sin( newRate * millis() - newPhase);
  return wave;
}

function record(){
  if(!recording){
    recorder.record(recordedFile);
    recordButton.disabled = true;
    stopRecordButton.disabled = false;

    recording = true;
  }
}

function stopRecord(){
  if(recording){
    recorder.stop();
    setTimeout(function(){
      save(recordedFile, "recording.wav");
    }, 2000);
    recordButton.disabled = false;
    stopRecordButton.disabled = true;

    recording = false;
  }
}
