import {
    assert,
    range,
    $switch,
    ThrottleTime,
    Vector,
    Rect,
    } from './utils.js'




let State = null

function draw(self, canvasTransform, _State){
    State = _State
    const cnv = self.$refs.maincanvas
    const ctx = cnv.getContext('2d')
    const w = cnv.width
    const h = cnv.height

    const cnv2 = self.$refs.maincanvas2
    const ctx2 = cnv2.getContext('2d')

    const clampOn = (min,max,v)=>v<=min ? min : v>max ? max : v

    const color = self.brushcolor

    const opt = {
        r:color.r,
        g:color.g,
        b:color.b,
        len:self.brushsize,
    }

    // const mass = self.drawmassCoef
    const mass = 5*(2**self.drawmassCoef)

    const modeAOpacity = self.useOpacity ? 0.5 : 1.0
    cnv2.style.opacity = modeAOpacity
    const drawmode = self.drawmode

    const checked = {}
    const DrawMode = self.DrawMode
    const f = $switch(drawmode, {
        [DrawMode.experimental_A]:_=>f1,
        [DrawMode.experimental_A0]:_=>f1,
        [DrawMode.experimental_Crease]:_=>f1,
        [DrawMode.experimental_Mochi]:_=>f2,
        // [DrawMode.Regular]:_=>f3,
        [DrawMode.Regular]:_=>f3_test,
        [DrawMode.experimental_Erode]:_=>f_erode,
        // [DrawMode.Dilate]:_=>,
        default:_=>{throw new Error('invalid mode')},
    })


    let timerId = -1
    if(self.sizeOnTime) {
        opt.len = 2
        timerId = setInterval(_=>{
            opt.len = Math.min(opt.len*1.2, self.brushsize)
        // },100)
        },50)
    }

    const prevpos = {x:NaN, y:NaN}
    const path = []

    const move = e2=>{
        if(throttle(5))
        // if(throttle(2))
            return

        const {x,y} = canvasTransform.mousePositionOnCanvasRaw()
        // console.log('Talmessite', window.e = e2)
        // const [x,y] = [e2.clientX, e2.clientY] /// #debug
        if(self.useinterp && !isNaN(prevpos.x)){
            const u = prevpos.x
            const v = prevpos.y
            const dx = x-u
            const dy = y-v
            const d = (dx**2+dy**2)**(1/2)
            if(d>=1.0){
                const n = self.brushsize <= self.interpLimitSize ? d : 10
                const step = 1/n
                for(const t of range(0.0, 1.0, step)) {
                    const xx = (u+dx*t+.5)<<0
                    const yy = (v+dy*t+.5)<<0
                    f(xx, yy, {self,w,h,checked,opt,mass,ctx,ctx2,DrawMode,drawmode}   )
                }
            }
        }
        f(x+.5<<0, y+.5<<0, {self,w,h,checked,opt,mass,ctx,ctx2,DrawMode,drawmode}   )

        prevpos.x = x
        prevpos.y = y
        path.push(new Vector(x,y))
    }
    const up = e3=>{
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        clearInterval(timerId)

        move(e3)

        const bound = Rect.getBound(path).margin(self.brushsize+10)

        if([DrawMode.experimental_A, DrawMode.experimental_Mochi, DrawMode.Regular].includes(drawmode)){
            ctx.globalAlpha = modeAOpacity
            ctx.drawImage(cnv2, bound.x,bound.y,bound.width,bound.height
                              , bound.x,bound.y,bound.width,bound.height)
            ctx.globalAlpha = 1.0
            ctx2.clearRect(bound.x,bound.y,bound.width,bound.height)
        }

        const buf = ctx.getImageData(bound.x,bound.y,bound.width,bound.height)
        const tempctx = State.tempcnv.getContext('2d')
        const buf0 = tempctx.getImageData(bound.x,bound.y,bound.width,bound.height)

        State.urs.stack(_=>{
            ctx.putImageData(buf0, bound.x, bound.y)
            tempctx.putImageData(buf0, bound.x, bound.y)
        },_=>{
            ctx.putImageData(buf, bound.x, bound.y)
            tempctx.putImageData(buf, bound.x, bound.y)
        })
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)

}

const throttle = ThrottleTime.create()


function f1(x0,y0, {self,w,h,checked,opt,mass,ctx,ctx2,DrawMode,drawmode}){
    if(x0<0||x0>=w||y0<0||y0>=h)
        return
    const p = {x:x0,y:y0}
    const len = opt.len

    let velocity = -1
    function proc(i,j){
        if(checked[i+','+j])
        // if(!self.useOpacity && checked[i][j]) ///
            return
        const c = vs[i][j]

        if(c === 255)
            checked[i+','+j] = true

        if(drawmode === DrawMode.experimental_A0) {
            ctx.fillStyle = `rgba(${opt.r},${opt.g},${opt.b}, ${self.useOpacity ? 0.5 : 1.0})`
            ctx.fillRect(j,i,1,1)

            if(c === 255)
                return
            velocity -= (255-c)*mass
        } else if(drawmode === DrawMode.experimental_A) {
            ctx2.fillStyle = `rgba(${opt.r},${opt.g},${opt.b},1.0)`
            ctx2.fillRect(j,i,1,1)

            if(c === 255)
                return
            velocity -= (255-c)*mass
        } else if(drawmode === DrawMode.experimental_Crease) {
            if(c === 255)
                return

            const q = {
                x: j,
                y: i,
                value: (255-c)/255,
            }
            lineOrdered(ctx, q, p, opt)

            velocity -= (255-c)*mass
        } else
            throw new Error('invalid mode:'+drawmode)


    }

    const vs = State.origValueMatrix
    const pi2 = Math.PI*2

    const tStep = self.useconststep ? 0.05 : Math.asin(1/len/2)
    // const tStep = self.useconststep ? 0.01 : Math.asin(1/len)/2

    proc(y0,x0)

    for(let t=0; t<pi2; t+=tStep) {
        const dx = len*Math.cos(t)
        const dy = len*Math.sin(t)
        const ax = x0+dx
        const ay = y0+dy

        velocity = 255
        if(Math.abs(dx) >= Math.abs(dy)) {
            const k = dy/dx
            const ls = Math.abs(x0-ax)
            const jstep = dx >= 0 ? 1 : -1
            let j = x0
            for(let s=0; s<=ls; s++) {
                if(!self.ignoreVelocity && velocity<=0)
                    break

                j += jstep
                // let i = y0+(k*(j-x0))<<0
                let i = y0+(k*(j-x0)+0.5)<<0
                if( j<0 || j>=w || i<0 || i>=h)
                    break

                proc(i,j)
            }
        } else {
            const k = dx/dy
            const ls = Math.abs(y0-ay)
            const istep = dy >= 0 ? 1 : -1
            let i = y0
            for(let s=0; s<=ls; s++) {
                if(!self.ignoreVelocity && velocity<=0)
                    break

                i += istep
                // let j = x0+(k*(i-y0))<<0
                let j = x0+(k*(i-y0)+0.5)<<0
                if( j<0 || j>=w || i<0 || i>=h)
                    break

                proc(i,j)
            }
        }
    }
}


function f2(x0,y0, {self,w,h,opt,mass,ctx,ctx2,DrawMode,drawmode}){
    if(x0<0||x0>=w||y0<0||y0>=h)
        return
    const p = {x:x0,y:y0}
    const len = opt.len

    let velocity = -1

    const vs = State.origValueMatrix
    const pi2 = Math.PI*2

    const tStep = 0.05

    let ls = len
    if(!self.ignoreVelocity){
        for(let t=0; t<pi2; t+=tStep) {
            const dx = len*Math.cos(t)
            const dy = len*Math.sin(t)
            const ax = x0+dx
            const ay = y0+dy

            velocity = 255
            if(Math.abs(dx) >= Math.abs(dy)) {
                const k = dy/dx
                const jstep = dx >= 0 ? 1 : -1
                let j = x0
                for(let s=0; s<=ls; s++) {
                    j += jstep
                    // let i = y0+(k*(j-x0))<<0
                    let i = y0+(k*(j-x0)+0.5)<<0
                    if( j<0 || j>=w || i<0 || i>=h)
                        break

                    const c = vs[i][j]
                    if(c !== 255)
                        velocity -= (255-c)*mass

                    if(velocity<=0){
                        const d2 = (j-x0)**2 + (i-y0)**2
                        if(d2 < ls**2)
                            ls = d2**(1/2)
                        break
                    }
                }
            } else {
                const k = dx/dy
                const istep = dy >= 0 ? 1 : -1
                let i = y0
                for(let s=0; s<=ls; s++) {
                    i += istep
                    // let j = x0+(k*(i-y0))<<0
                    let j = x0+(k*(i-y0)+0.5)<<0
                    if( j<0 || j>=w || i<0 || i>=h)
                        break

                    const c = vs[i][j]
                    if(c !== 255)
                        velocity -= (255-c)*mass

                    if(velocity<=0){
                        const d2 = (j-x0)**2 + (i-y0)**2
                        if(d2 < ls**2)
                            ls = d2**(1/2)
                        break
                    }
                }
            }
        }
    }

    ctx2.fillStyle = `rgba(${opt.r},${opt.g},${opt.b},1.0)`
    ctx2.beginPath()
    ctx2.arc(x0,y0,ls,0,pi2)
    ctx2.fill()
}


function f3(x0,y0, {self,w,h,opt,mass,ctx,ctx2,DrawMode,drawmode}){
    if(x0<0||x0>=w||y0<0||y0>=h)
        return
    const p = {x:x0,y:y0}
    const len = opt.len

    const vs = State.origValueMatrix
    const pi2 = Math.PI*2

    const tStep = 0.05

    if(self.ignoreVelocity){
        ctx2.fillStyle = `rgba(${opt.r},${opt.g},${opt.b},1.0)`
        ctx2.beginPath()
        ctx2.arc(x0,y0,len,0,pi2)
        ctx2.fill()
    } else {
        const ps = []
        for(let t=0; t<pi2; t+=tStep) {
            const dx = len*Math.cos(t)
            const dy = len*Math.sin(t)
            const ax = x0+dx
            const ay = y0+dy

            let j
            let i
            let velocity = 255
            if(Math.abs(dx) >= Math.abs(dy)) {
                const k = dy/dx
                const jstep = dx >= 0 ? 1 : -1
                const ls = Math.abs(x0-ax)
                j = x0
                for(let s=0; s<=ls; s++) {
                    j += jstep
                    // let i = y0+(k*(j-x0))<<0
                    i = y0+(k*(j-x0)+0.5)<<0
                    if( j<0 || j>=w || i<0 || i>=h)
                        break

                    const c = vs[i][j]
                    if(c !== 255)
                        velocity -= (255-c)*mass

                    if(velocity<=0)
                        break
                }
                // ps.push({x:j, y:i})
                // const j2 = j+jstep/2
                const j2 = j+jstep/4
                // ps.push({x:(j2+.5)<<0, y:y0+(k*(j2-x0)+.5)<<0})
                ps.push({x:j2, y:y0+k*(j2-x0)})
            } else {
                const k = dx/dy
                const istep = dy >= 0 ? 1 : -1
                const ls = Math.abs(y0-ay)
                i = y0
                for(let s=0; s<=ls; s++) {
                    i += istep
                    // let j = x0+(k*(i-y0))<<0
                    j = x0+(k*(i-y0)+0.5)<<0
                    if( j<0 || j>=w || i<0 || i>=h)
                        break

                    const c = vs[i][j]
                    if(c !== 255)
                        velocity -= (255-c)*mass

                    if(velocity<=0)
                        break
                }
                // ps.push({x:j, y:i})
                // const i2 = i+istep/2
                const i2 = i+istep/4
                // ps.push({x:x0+(k*(i2-y0)+.5)<<0, y:(i2+.5)<<0})
                ps.push({x:x0+k*(i2-y0), y:i2})
            }
        }

        ctx2.fillStyle = `rgba(${opt.r},${opt.g},${opt.b},1.0)`
        ctx2.beginPath()
        ctx2.moveTo(ps[0].x, ps[0].y)
        for(const p of ps.slice(1))
            ctx2.lineTo(p.x, p.y)
        ctx2.closePath()
        ctx2.fill()
    }
}

// const N = 20
const N = 40
const [sinTable, cosTable] = (_do=>{
    const sinTable = []
    const cosTable = []
    const pi2 = Math.PI*2
    /*const tStep = 1/N
    for(let t=0; t<pi2; t+=tStep) {*/
    for(let i=0; i<N; i++) {
        const t = i/N*pi2
        const ct = Math.cos(t)
        const st = Math.sin(t)
        sinTable.push(st)
        cosTable.push(ct)
    }
    return [sinTable, cosTable]
})()

function f3_test(x0,y0, {self,w,h,opt,mass,ctx,ctx2,DrawMode,drawmode}){
    if(x0<0||x0>=w||y0<0||y0>=h)
        return
    const p = {x:x0,y:y0}
    const len = opt.len

    const vs = State.origValueMatrix
    const pi2 = Math.PI*2

    if(self.ignoreVelocity){
        ctx2.fillStyle = `rgba(${opt.r},${opt.g},${opt.b},1.0)`
        ctx2.beginPath()
        ctx2.arc(x0,y0,len,0,pi2)
        ctx2.fill()
    } else {
        const ps = []
        /*for(let t=0; t<pi2; t+=tStep) {
            const ct = Math.cos(t)
            const st = Math.sin(t)*/
        for(let ti=0; ti<N; ti++) {
            const ct = cosTable[ti]
            const st = sinTable[ti]
            let j
            let i
            let velocity = 255
            let s
            for(s=0; s<len; s++) {
                i = (y0+s*st+.5)<<0
                j = (x0+s*ct+.5)<<0

                if( j<0 || j>=w || i<0 || i>=h)
                    break

                const c = vs[i][j]
                if(c !== 255)
                    velocity -= (255-c)*mass

                if(velocity<=0)
                    break
            }
            // ps.push({x:j, y:i})
            // const [i2, j2] = [i+st/2, j+ct/2]
            // const [i2, j2] = [y0+s*st+st/2, x0+s*ct+ct/2]
            // const [i2, j2] = [i+st/4, j+ct/4]
            // ps.push({x:(j2+.5)<<0, y:(i2+.5)<<0})
            // ps.push({x:j2, y:i2})

            /// #test - offset `.5`
            if(self.useLittleExtendedRegion) {
                const [i2, j2] = [y0+s*st+st/2, x0+s*ct+ct/2]
                ps.push({x:j2+.5, y:i2+.5})
            } else {
                ps.push({x:j+.5, y:i+.5})
            }
        }

        ctx2.fillStyle = `rgba(${opt.r},${opt.g},${opt.b},1.0)`
        ctx2.beginPath()
        ctx2.moveTo(ps[0].x, ps[0].y)
        for(const p of ps.slice(1))
            ctx2.lineTo(p.x, p.y)
        ctx2.closePath()
        ctx2.fill()
    }
}

function f_erode(x0,y0, {self,w,h,opt,mass,ctx,ctx2,DrawMode,drawmode}){
    if(x0<0||x0>=w||y0<0||y0>=h)
        return

    if(!f_erode.throttle)
        f_erode.throttle = ThrottleTime.create()
    if(f_erode.throttle(30))
        return

    const len = opt.len

    const bound = Rect.round(new Rect(x0-len, y0-len, len*2, len*2))
    bound.trimWith(new Rect(0,0,w,h))


    const imd = ctx.getImageData(bound.x, bound.y, bound.width, bound.height)
    const view = imd.data
    const viewGray = new Uint8ClampedArray(bound.width*bound.height)
    const viewNext = new Uint8ClampedArray(view.buffer.slice(0))
    // const viewNext = new Uint8ClampedArray(view.length)
    assert(viewGray.length*4 === view.length)

    const bw = bound.width
    for(let y=0; y<bound.height; y++)
        for(let x=0; x<bw; x++) {
            const i = y*bw+x
            const i2 = i*4
            viewGray[i] = Math.round(0.2989*view[i2] + 0.5870*view[i2+1] + 0.1140*view[i2+2])
        }

    /*for(let y=0; y<bound.height; y++)
        for(let x=0; x<bw; x++) {*/
    for(let y=1; y<bound.height-1; y++) /// +1/-1 -- #temp
        for(let x=1; x<bw-1; x++) {
            let min = 255
            const idx0 = (y*bw+x)*4
            for(let i=y-1; i<=y+1; i++)
                for(let j=x-1; j<=x+1; j++) {
                    const idx = i*bw+j
                    if(viewGray[idx] < min) {
                        min = viewGray[idx]
                        const idx2 = idx*4
                        viewNext[idx0] = view[idx2]
                        viewNext[idx0+1] = view[idx2+1]
                        viewNext[idx0+2] = view[idx2+2]
                        viewNext[idx0+3] = view[idx2+3]
                    }
                }
        }

    ctx.putImageData(new ImageData(viewNext, bound.width, bound.height), bound.x, bound.y)
}

function lineOrdered(ctx, a, b, opt={r:0,g:0,b:0,len:100}){
    /**
    a : Object{ x, y, value }
    b : Object{ x, y }
    */
    ///
    const maxdist = opt.len
    const split = 10

    ///
    const tstep = 1.0/split

    function f(t){
        if(t+tstep>1.0)
            return
        const px = a.x+(b.x-a.x)*t
        const py = a.y+(b.y-a.y)*t
        const qx = a.x+(b.x-a.x)*(t+tstep)
        const qy = a.y+(b.y-a.y)*(t+tstep)

        const dist = Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2)
        if(dist>=maxdist)
            return

        // const alpha = (1.0-t)*a.value
        const alpha = ((k, h)=> ((1.0-t)**h) * a.value * (k * 1/(dist+1) ))(10.0, 5)
        ctx.strokeStyle=`rgba(${opt.r},${opt.g},${opt.b}, ${alpha})`

        ctx.beginPath()
        ctx.moveTo(px,py)
        ctx.lineTo(qx,qy)
        ctx.stroke()
    }

    for(const t of range(0.0,1.0,tstep))
        f(t)
    f(1.0)
}

export {
    draw,
}
