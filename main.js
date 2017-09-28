import {
    assert,
    range,
    setImmediate,
    $switch,
    ThrottleTime,
    freezed,
    tortologyDict,
    UndoRedoStack,
    gaussBlur,
    Vector,
    } from './mods/utils.js'

import {
    draw,
    } from './mods/draw.js'

import {CanvasTransform} from './mods/canvastransform.js'
import {ANColorPicker} from './lib/ancp.js'


function main(){

    const State = freezed({
        imgview: null,
        img: null,
        urs: null,
        ancp: null,
        origValueMatrix: null,
        canvasTransform: null,
        canvasTransformOps: null,

        tempcnv: null,
    })

    const DrawMode = tortologyDict(`
        Regular
        Mochi
        experimental_A
        experimental_A0
        experimental_Crease
        `)

    const app = new Vue({
        el: '#vue-root',
        data: {
            appinited:false,
            width: 0,
            height: 0,

            DrawMode: DrawMode,
            drawmode: DrawMode.Regular,
            useOpacity: false,
            sizeOnTime: false,
            brushsize: 40,
            useconststep: true,
            ignoreVelocity: false,
            drawmassCoef: 0,
            useinterp: true,
            interpLimitSize: 10,
            // interpLimitSize: 300,

            ///
            readyToPanCanvas: false,

            ///
            brushcolor: new Color(0,0,0),
            brushcolor2: new Color(255,255,255),

            /// UI
            showHelp: true,
            openImagesVisible: false,
            openImagesPinned: false,
            canvasInitializing: false,
            colorPickerVisible: false,
            colorPickerPinned: true,
        },
        computed:{
            frontColorStyle(){
                return `rgb(${this.brushcolor.r},${this.brushcolor.g},${this.brushcolor.b})`
            },
            backColorStyle(){
                return `rgb(${this.brushcolor2.r},${this.brushcolor2.g},${this.brushcolor2.b})`
            },
            ui_showuni(){
                const DrawMode = this.DrawMode
                return [DrawMode.experimental_A
                       ,DrawMode.experimental_A0
                       ,DrawMode.experimental_Crease].includes(this.drawmode)
            },
        },

        methods: {
            p(...args){console.log(args)},

            pinvis(name){
                assert(name+'Visible' in this)
                assert(name+'Pinned' in this)
                // return (this[name+'Visible'] || this[name+'Pinned']) ? 'show' : 'hide'
                return (this[name+'Visible'] || this[name+'Pinned']) ? '' : 'hide'
            },

            status(msg){
                this.$refs.status.textContent = msg
            },

            onFileChange(e){
                this.status('loading...')

                setImmediate(_=>{
                    this._filechange(e.target.files[0])
                })
            },


            onPaste(e){
                this._getPastedImageFile(e, file=>{
                    e.target.blur()
                    this._filechange(file)
                })
            },
            _filechange(file){
                loadImageFile(file, e=>{
                    this.status('')
                    const {name, img} = e
                    this.initCanvas({name, img})
                })
            },

            onFileChange_Fill(e){
                this._filechange_Fill(e.target.files[0])
            },
            onPaste_Fill(e){
                this._getPastedImageFile(e, file=>{
                    e.target.blur()
                    this._filechange_Fill(file)
                })
            },
            _filechange_Fill(file){
                loadImageFile(file, e=>{
                    const {name, img} = e

                    const cnv = this.$refs.maincanvas
                    const ctx = cnv.getContext('2d')
                    clearCanvas(cnv, 'rgba(255,255,255,1.0)')
                    ctx.drawImage(img,0,0)
                    State.tempcnv.getContext('2d').drawImage(cnv,0,0)
                    State.urs.forget() /// temp
                })
            },

            _getPastedImageFile(e, callback){
                if(document.activeElement !== e.target)
                    return
                e.preventDefault()

                const cd = e.clipboardData
                if (!(cd || cd.types || cd.types.length === 1 || cd.types[0] === 'Files'))
                    return

                const imageFile = e.clipboardData.items[0].getAsFile()
                if(!imageFile)
                    return

                callback(imageFile)
            },
            onPasteKeydown(e){
                if(!(e.ctrlKey && e.code==='KeyV'))
                    e.preventDefault()
            },

            initCanvas({name, img}){
                this.canvasInitializing = true

                // console.log('initCanvas', name, img)
                this.width = img.naturalWidth
                this.height = img.naturalHeight

                setImmediate(_=>{
                    if(State.img)
                        revokeImgs([State.img])

                    const W = this.width
                    const H = this.height
                    const cnv = this.$refs.maincanvas
                    const ctx = cnv.getContext('2d')

                    if(false)
                        /// use alpha
                        clearCanvas(cnv)
                    else {
                        /// non-alpha
                        clearCanvas(cnv, 'rgba(255,255,255,1.0)')
                    }

                    ///
                    const ctx2 = this.$refs.origimgpreviewcanvas.getContext('2d')
                    ctx2.drawImage(img, 0,0)

                    ///
                    const origview = ctx2.getImageData(0,0,W,H).data /// Uint8ClampedArray
                    State.img = img

                    const tempcnv = document.createElement('canvas')
                    tempcnv.width = W
                    tempcnv.height = H
                    tempcnv.getContext('2d').drawImage(cnv,0,0)
                    State.tempcnv = tempcnv


                    /// origValueMatrix[y][x]
                    void function(){

                        const ab = new ArrayBuffer(W*H)
                        const abDest = new ArrayBuffer(W*H)
                        const view = new Uint8ClampedArray(ab)
                        const viewDest = new Uint8ClampedArray(abDest)
                        var i=0
                        var j=0
                        for(const y of range(H))
                            for(const x of range(W)) {
                                // view[i] = origview[j]
                                view[i] = Math.round(0.2989*origview[j] + 0.5870*origview[j+1] + 0.1140*origview[j+2])
                                i++
                                j+=4
                            }
                        // gaussBlur(abDest, ab, W, H, 5)
                        gaussBlur(abDest, ab, W, H, 1)

                        State.origValueMatrix = []
                        var i=0
                        for(const y of range(H)) {
                            const a = []
                            for(const x of range(W)) {
                                a.push(viewDest[i++])
                            }
                            // State.origValueMatrix[y] = a
                            State.origValueMatrix[y] = new Uint8ClampedArray(a)
                        }
                    }()


                    void function(){
                        /// centering
                        const ct = State.canvasTransform
                        ct.resetTransform2()
                        const center = new Vector( window.pageXOffset + document.body.clientWidth/2
                                                 , window.pageYOffset + document.body.clientHeight/2 )
                        ct.translate(center.sub(new Vector(W/2, H/2)))
                        ct.update()
                    }()

                    State.urs.forget()

                    this.canvasInitializing = false
                })
            },
            onMousedown(e){
                const cnv = this.$refs.maincanvas
                // if(e.target === cnv) {
                if(e.target === cnv || e.target === document.body) {
                    e.preventDefault()
                    document.activeElement.blur()

                    void function(){
                        /// prevent context menu on right click
                        if(e.ctrlKey || e.altKey)
                            return
                        const f = e=>e.preventDefault()
                        const up = e=>{
                            e.preventDefault()
                            document.removeEventListener('mouseup', up)
                            setImmediate(_=>{
                                document.removeEventListener('contextmenu', f)
                            })

                        }
                        document.addEventListener('contextmenu', f)
                        document.addEventListener('mouseup', up)
                    }()

                    if(this.readyToPanCanvas) {
                        State.canvasTransformOps.startPan()
                    } else if(e.altKey) {
                        const {x,y} = State.canvasTransform.mousePositionOnCanvas()
                        changeBrushSize(this, this.$refs.uicanvas, State.canvasTransform, x,y)
                    } else if(e.ctrlKey || e.button === 2 || e.button === 1) {
                        const {x,y} = State.canvasTransform.mousePositionOnCanvas()
                        const c = pickColor(cnv, x, y)
                        this.brushcolor.r = c.r
                        this.brushcolor.g = c.g
                        this.brushcolor.b = c.b
                        State.ancp.setColor(c.r, c.g, c.b)
                    } else {
                        draw(this, State.canvasTransform, State)
                    }

                    return false

                }

            },
        },

        mounted() {
            document.addEventListener('mousedown', e=>{
                this.onMousedown(e)
            })

            // window.addEventListener('keypress', e=>console.log(e))

            const keymap = {
                F1:{down:e=>{}}, /// prevent
                Enter: {down:e=>{
                    const cnv = this.$refs.maincanvas
                    const ctx = cnv.getContext('2d')
                    // ctx.clearRect(0,0,this.width,this.height)
                    ctx.fillStyle = 'rgba(255,255,255,1.0)'
                    ctx.fillRect(0,0,this.width,this.height)
                    State.tempcnv.getContext('2d').drawImage(cnv,0,0)
                }},
                'C:KeyZ': {down:e=> State.urs.undo()},
                'C:KeyY': {down:e=> State.urs.redo()},
                KeyQ: {down:e=> this.useOpacity = !this.useOpacity},
                KeyX: {down:e=> [this.brushcolor, this.brushcolor2] = [this.brushcolor2, this.brushcolor] },
                Digit1: {down:e=>this.drawmassCoef-=1},
                Digit2: {down:e=>this.drawmassCoef+=1},
                KeyH: {down:e=>this.showHelp = !this.showHelp},

                KeyC: {down:e=>this.ignoreVelocity=true, up:e=>this.ignoreVelocity=false},
                Space: {down:e=>this.readyToPanCanvas=true, up:e=>this.readyToPanCanvas=false},

                /// canvas transform
                KeyF: {down:e=>State.canvasTransformOps.flip()},
                Delete: {down:e=>State.canvasTransformOps.rotate(-RotPref.angle), repeat:true},
                End: {down:e=>State.canvasTransformOps.rotate(RotPref.angle), repeat:true},
                F2:       {down:e=> State.canvasTransformOps.zoom(1/ZoomPref.step), repeat:true},
                PageDown: {down:e=> State.canvasTransformOps.zoom(1/ZoomPref.step), repeat:true},
                F3:     {down:e=> State.canvasTransformOps.zoom(ZoomPref.step), repeat:true},
                PageUp: {down:e=> State.canvasTransformOps.zoom(ZoomPref.step), repeat:true},
                F4:   {down:e=> State.canvasTransformOps.resetTransform()},
                Home: {down:e=> State.canvasTransformOps.resetTransform()},
                Insert: {down:e=> State.canvasTransformOps.resetRotation()},
            }
            const downstate = {}
            window.addEventListener('keydown', e=>{
                if(/^(Alt|Control|Shift)/.test(e.code))
                    return

                const n0 = downstate[e.code]
                if(n0) {
                    e.preventDefault()
                    const o = keymap[n0]
                    if(o && o.repeat && o.down)
                        o.down(e)
                } else {
                    const n = (e.altKey?'A:':'')+(e.ctrlKey?'C:':'')+(e.shiftKey?'S:':'')+e.code
                    const o = keymap[n]
                    if(o) {
                        e.preventDefault()
                        if(o.down)
                            o.down(e)
                    }
                    downstate[e.code] = n
                }
            })
            window.addEventListener('keyup', e=>{
                if(/^(Alt|Control|Shift)/.test(e.code))
                    return

                const n = downstate[e.code]
                downstate[e.code] = ''
                const o = n ? keymap[n] : null
                if(o){
                    e.preventDefault()
                    o.up && o.up(e)
                }

            })

            const RotPref = {
                angle: Math.PI*90/180/8,
            }
            const ZoomPref = {
                step: Math.pow(2, 1/2),
            }

            /*void function(){
                /// #debug
                for(const a of 'A: C: S: A:C: A:S: C:S: A:C:S:'.split(/\s+/).concat([''])) {
                    keymap[a+'KeyA'] = {down:e=>console.log(a+'a'), up:e=>console.log(a+'!a')}
                    keymap[a+'KeyS'] = {down:e=>console.log(a+'s'), up:e=>console.log(a+'!s')}
                }
                window.keymap = keymap
            }()*/


            State.urs = new UndoRedoStack()

            ///
            const ct = new CanvasTransform()
            State.canvasTransform = ct
            ct.activate('canvas-transform', 'maincanvas')
            ct.resetTransform()
            ct.update()
            State.canvasTransformOps = new CanvasTransformOps(ct)

            ///
            this.appinited = true
            this.$el.className=""
            const ini =  document.querySelector('#initializing')
            ini.parentNode.removeChild(ini)


            /// localStorage
            if(localStorage.uni) {
                try{
                    const los = JSON.parse(localStorage.uni)
                    this.showHelp = !!los.showHelp
                }catch(e){
                    console.warn(e)
                }
            }
            window.addEventListener('beforeunload', e=>{
                localStorage.uni = JSON.stringify({
                    showHelp: this.showHelp,
                })
            })

            ///
            void function(){
                const img = new Image()
                img.src = './res/a.png'
                img.onload = e=> app.initCanvas({name:'', img})
            }()
        }
    })


    void function(){
        /// color picker
        const ancp = new ANColorPicker(200)
        State.ancp = ancp

        const colorpickerStore = document.querySelector('#colorpicker-store')
        const colorpickerContainer = document.querySelector('#colorpicker')
        colorpickerContainer.appendChild(ancp.getContainer())
        ancp.onChange(e=>{
            if(!e.isTrusted)
                return
            const [r,g,b] = e.rgb
            // console.log(r,g,b)
            app.brushcolor.r = r
            app.brushcolor.g = g
            app.brushcolor.b = b
        })
    }()


    /// #debug
    // window.State = State
    window.app = app




    void function(){
        window.addEventListener('beforeunload', e=>{
            return (e || window.event).returnValue = 'leave?'
        })
    }()
}


class Color {
    constructor(r,g,b){
        this.r=r
        this.g=g
        this.b=b
    }
}


function pickColor(cnv, x, y){
    const ctx = cnv.getContext('2d')
    const imd = ctx.getImageData(x,y,1,1)
    const [r,g,b,a] = imd.data
    /// #todo - consider the alpha
    return new Color(r,g,b)
}

function changeBrushSize(self, uicnv, canvasTransform, x0, y0){
    const W = uicnv.width
    const H = uicnv.height
    const ctx = uicnv.getContext('2d')
    const move = e2=>{
        if(throttle(5))
            return
        const {x,y} = canvasTransform.mousePositionOnCanvas()
        const cx = (x+x0)/2
        const cy = (y+y0)/2
        const r = Math.sqrt((x-x0)**2+(y-y0)**2)/2
        ctx.clearRect(0,0,W,H)
        // uicnv.width = uicnv.width
        ctx.strokeStyle='rgba(0,0,0, 0.5)'
        ctx.beginPath()
        ctx.arc(cx,cy,r, 0, 2*Math.PI)
        ctx.stroke()
    }
    const up = e3=>{
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)

        const {x,y} = canvasTransform.mousePositionOnCanvas()
        const r = Math.sqrt((x-x0)**2+(y-y0)**2)/2
        ctx.clearRect(0,0,W,H)
        self.brushsize = (Math.min(r, 200))<<0
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
}

const throttle = ThrottleTime.create()

function revokeImgs(imgs){
    for(const img of imgs)
        URL.revokeObjectURL(img.src)
}

function loadImageFile(file, callback){
    assert(file.type.match(/image./))

    const img = new Image()
    img.onload = _=>{
        callback({name:file.name, img})
    }
    img.src = URL.createObjectURL(file)
}

function clearCanvas(cnv, fillStyle=null){
    const ctx = cnv.getContext('2d')
    if(fillStyle) {
        ctx.fillStyle = fillStyle
        ctx.fillRect(0,0,cnv.width,cnv.height)
    } else {
        ctx.clearRect(0,0,cnv.width,cnv.height)
    }
}

function startdrag(onMove=null, onUp=null, throttleInterval=5){
    const move = e2=>{
        if(throttle(throttleInterval))
            return
        onMove&&onMove(e2)
    }
    const up = e3=>{
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        onUp&&onUp(e3)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
}


class CanvasTransformOps {
    constructor(canvasTransform){
        this.ct = this.canvasTransform = canvasTransform
    }
    startPan(){
        const ct = this.ct
        const mp0 = ct.mousePositionOnWindow()
        const m0 = ct.getMatrix()
        const f = e=>{
            const mp = ct.mousePositionOnWindow()
            const dp = mp.sub(mp0)
            ct.setMatrix(m0.clone())
            ct.translate(dp)
            ct.update()
        }
        startdrag(f,f)
    }
    flip(){
        this.ct.flipH()
        this.ct.update()
    }
    zoom(k=1.0){
        this.ct.scale(k)
        this.ct.update()

        /// test
        app.$refs.origimgpreviewcanvas.style['image-rendering'] =
            this.ct.zoom >= 1.0 ? 'pixelated' : ''
    }
    // resetZoom(){
    // }
    rotate(angle=0.0){
        this.ct.rotate(angle)
        this.ct.update()
    }
    resetRotation(){
        const tr0 = this.ct.translation
        const zm0 = this.ct.zoom
        const piv = this.ct.getTransformPivot()

        this.ct.resetTransform()
        const m = this.ct.getMatrix()
        m.translate_(-piv.x, -piv.y)
        m.scale_(zm0, zm0)
        m.translate_(piv.x, piv.y)
        this.ct.setMatrix(m)
        this.ct.update()

    }

    resetTransform(){
        this.ct.resetTransform()
        this.ct.update()
    }
}


main()
