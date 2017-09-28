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
        [DrawMode.Mochi]:_=>f2,
        [DrawMode.Regular]:_=>f3,
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

        const {x,y} = canvasTransform.mousePositionOnCanvas()
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
                    const xx = (u+dx*t)<<0
                    const yy = (v+dy*t)<<0
                    f(xx, yy, {self,w,h,checked,opt,mass,ctx,ctx2,DrawMode,drawmode}   )
                }
            }
        }
        f(x,y, {self,w,h,checked,opt,mass,ctx,ctx2,DrawMode,drawmode}   )

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

        if([DrawMode.experimental_A, DrawMode.Mochi, DrawMode.Regular].includes(drawmode)){
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

    let velocity = -1

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
            velocity = 255
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
                ps.push({x:j, y:i})
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
                ps.push({x:j, y:i})
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
