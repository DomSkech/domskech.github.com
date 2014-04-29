/*jslint browser: true*/
var config = {
    bpm: 120,
    noteStyle: '#0A0 solid thick',
    steps: 8,
    signature: 4,
    waves:[
      'sine',
      'square',
      'sawtooth',
      'triangle'
    ],
    filters:[
        'lowpass',
        'highpass',
        'bandpass',
        'lowshelf',
        'peaking',
        'notch',
        'allpass'
    ]
};

var markup = {
    slider: '<input type="range" class="slider" />',
    controlUnit: '<div class="control{class}"><label>{name}</label></div>',
    custom: '<div class="{class}">{html}</div>',
    notCompatable: 'Browser not supported'
};

var tools = (function () {
    "use strict";

    function getEls(s) {
        // public shorthand function;
        return document.querySelectorAll(s);
    }

    function makeDom(m) {
        // public shorthand function to convert markup to DOM els;
        var h = document.createElement('div');
        h.innerHTML = m;
        return h.firstChild;
    }

    function placeStrings(t, rep) {
        // public shorthand function to find/replace string placeholders;
        // replace key should be in this format { "keyname":"value","name":"bob" }
        // where keyname is any string in {}s 

        var i,
            iReg;

        for (i in rep) {
            if (rep.hasOwnProperty(i)) {
                iReg = new RegExp('{' + i + '}', "g");
                t = t.replace(iReg, rep[i]);
            }
        }

        return t;
    }

    function append(p, c) {
        // public dom append tool
        var i = 0,
            els = (typeof p === 'object') ? [p] : getEls(p), // check if p is an object or selector
            l = els.length;

        for (i; i < l; i += 1) {
            els[i].appendChild(c);
        }
    }

    return {
        append: append,
        placeStrings: placeStrings,
        makeDom: makeDom,
        getEls: getEls
    };
}());

var SourceFactory = function (context) {
    "use strict";
    var freq,
        type,
        dest;

    this.makeOsc = function () {
        var src = context.createOscillator();
        src.frequency.value = freq;
        src.type = type;
        src.connect(dest);
        src.start = src.noteOn;
        src.stop = src.noteOff;
        return src;
    };

    this.setFreq = function (f) {
        freq = f;
    };
    this.setType = function (t) {
        type = config.waves[t];
    };
    this.connect = function (d) {
        dest = d;
    };
    return this; // explicit
};

var sequencer = function (src) {
    "use strict";
    var notes = [],
        bpm = config.bpm,
        beatMilli,
        i = 0,
        active = false,
        osc = src,
        int;

    function playNote() {
        function stopNote() {
            src.stop(0);
            src = null;
        }

        if (active) {
            var src = osc.makeOsc();
            // no outline on previous step

            notes[i].boundFreq.style.outline = "";
            notes[i].boundDur.style.outline = "";

            i += 1;
            if (i >= notes.length) {
                i = 0;
            }
            // outline on current step
            notes[i].boundFreq.style.outline = config.noteStyle;
            notes[i].boundDur.style.outline = config.noteStyle;

            src.frequency.value = notes[i].f;
            src.start(0);
            window.setTimeout(stopNote, notes[i].d);
            window.setTimeout(playNote, beatMilli);
        }
    }

    function noteEditor(i, prop) { // return note editor closure for currying
        return function (val) {
            notes[i] = notes[i] || {};
            notes[i][prop] = val;
        };
    }

    function start() {
        active = true;
        int = window.setTimeout(playNote, beatMilli);
    }

    function stop() {
        active = false;
        window.clearTimeout(int);
    }

    function power(v) {
        if (v > 0) {
            start();
        } else {
            stop();
        }
    }

    function setBpm(b) {
        bpm = b;
        beatMilli = (60 * 1000 / (config.steps / config.signature)) / bpm; // divided by steps/4 (assuming 4/4 time signature)
    }
    return {
        power: power,
        notes: notes,
        setBpm: setBpm,
        noteEditor: noteEditor
    };
};

var createNode = function (context, type) {
    "use strict";
    if(typeof(context.type)!='undefined'){
        type=type.replace('Node','');
    }    
    var node = context[type]();
    node.makeParam = function (prop) {
        return function (val) {
            if(type==='createBiquadFilter' && prop==='type'){
                val = config.filters[val];
            }

            if (node[prop].hasOwnProperty('value')) {
                node[prop].value = val; // check if has 'value' if not...
            } else {
                node[prop] = val; // change property directly 
            }
        };
    };

    return node;
};


var synth = (function () {
    "use strict";
    var context;

    if (window.hasOwnProperty('webkitAudioContext')) {
        context = new window.webkitAudioContext();
    } else if (window.hasOwnProperty('AudioContext')) {
        context = new window.AudioContext();
    } else {
        throw new Error("AudioContext not supported!");
    }

    function applyAttrs(toObj, attrs) {
        var i;
        for (i in attrs) {
            if (attrs.hasOwnProperty(i)) {
                toObj[i] = attrs[i];
            }
        }
    }

    function bindEvent(toObj, bound) {
        toObj.onchange = function () {
            bound(this.value);
        };
    }

    function insertControl(name, type, bound, attrs) {
        var adjMkp = tools.placeStrings(markup.controlUnit, {
            'name': name,
            'class': " " + type
        }),
            ctrl = tools.makeDom(markup.slider),
            unit = tools.makeDom(adjMkp);

        applyAttrs(ctrl, attrs);
        bindEvent(ctrl, bound);
        tools.append(unit, ctrl);
        tools.append('.wrapper', unit);

        if (attrs.hasOwnProperty('value')) {
            ctrl.value = attrs.value;
            bound(attrs.value);
        }
        return unit;
    }
    // INITIALISE THE SYNTH
    function init() {
        var i = 0,
            bindEl,
            src = new SourceFactory(context),
            gainNode = createNode(context, 'createGainNode'),
            delayNode = createNode(context, 'createDelayNode'),
            delayGain = createNode(context, 'createGainNode'),
            feedbackGain = createNode(context, 'createGainNode'),
            filter = createNode(context, 'createBiquadFilter'),
            seq = sequencer(src),
            blankMkp = tools.placeStrings(markup.custom, {
                'html': '',
                'class': "blank"
            }),
            rowMkp = tools.placeStrings(markup.custom, {
                'html': '',
                'class': "row"
            });
        document.querySelector('.wrapper').innerHTML = ""; // remove warning message

        // INSERTION OF UNITS and NODES
        insertControl("ON/OFF", "clock", seq.power, {
            value: 0,
            min: 0,
            max: 1
        });
        for (i = 0; i < config.steps; i += 1) {
            bindEl = insertControl("Freq " + (i + 1), "seq seq" + i, seq.noteEditor(i, 'f'), {
                value: 400,
                min: 0,
                max: 2000
            });
            seq.noteEditor(i, 'boundFreq')(bindEl); // bind elements for quicker dom manipulation later
        }
        tools.append('.wrapper', tools.makeDom(rowMkp));
        insertControl("BPM", "clock", seq.setBpm, {
            value: 120,
            min: 0,
            max: 300,
            step: 1
        });

        for (i = 0; i < config.steps; i += 1) {
            bindEl = insertControl("Time " + (i + 1), "seq seq" + i, seq.noteEditor(i, 'd'), {
                value: 200,
                min: 0,
                max: 500
            });
            seq.noteEditor(i, 'boundDur')(bindEl); // bind elements for quicker dom manipulation later
        }

        tools.append('.wrapper', tools.makeDom(rowMkp));
        insertControl("Wave", "source", src.setType, {
            value: 0,
            min: 0,
            max: config.waves.length-1
        });
        insertControl("Gain", "source", gainNode.makeParam('gain'), {
            value: 0.4,
            min: 0,
            max: 1,
            step: 0.01
        });
        tools.append('.wrapper', tools.makeDom(blankMkp));

        insertControl("Delay", "reverb", delayGain.makeParam('gain'), {
            value: 0.4,
            min: 0,
            max: 1,
            step: 0.01
        });
        insertControl("Time", "reverb", delayNode.makeParam('delayTime'), {
            value: 0,
            min: 0,
            max: 0.5,
            step: 0.01
        });
        insertControl("Feedbk", "reverb", feedbackGain.makeParam('gain'), {
            value: 0,
            min: 0,
            max: 1,
            step: 0.01
        });
        tools.append('.wrapper', tools.makeDom(blankMkp));

        insertControl("Filter", "gain", filter.makeParam('type'), {
            value: 0,
            min: 0,
            max: config.filters.length-1
        });
        insertControl("Freq", "gain", filter.makeParam('frequency'), {
            value: 1000,
            min: 0,
            max: 3000
        });
        insertControl("Q", "gain", filter.makeParam('Q'), {
            value: 2,
            min: 0,
            max: 30,
            step: 0.01
        });

        // WIRING OF PATHWAYS
        src.connect(filter); // 'src' is a factory object its connect method defines where any FUTURE osc nodes will connect to;
        filter.connect(gainNode);
        gainNode.connect(context.destination);
        gainNode.connect(delayNode);

        delayNode.connect(delayGain);
        delayNode.connect(feedbackGain);
        feedbackGain.connect(delayNode);
        delayGain.connect(context.destination);

    }

    return {
        init: init,
        context: context
    };
}());

function onDomReady() {
    "use strict";
    synth.init();
}

if (document.addEventListener) {
    document.addEventListener('DOMContentLoaded', onDomReady, false);
}