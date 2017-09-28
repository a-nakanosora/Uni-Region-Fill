
const {ANColorPicker} = (function(){
    /**
    class ANColorPicker
        - ancp.getContainer()
        - ancp.onChange(callback)
            -- callback({rgb, hsv, isTrusted})
                - isTrusted : Boolean -- setColor/setColorHsv から呼び出された際に false となる
        - ancp.setColor(r,g,b)
        - ancp.setColorHsv(h,s,v)
    */

    class ANColorPicker {
        constructor(size=200){
            const W=Math.round(size)
            const H=Math.round(size)
            const W2=Math.round(size/2)
            const H2=Math.round(size/2)

            const dom = htmlToDom(`
                    <div class="a-n-colorpicker-container">
                        <canvas class="color-circle" width="${W}" height="${H}"></canvas>
                        <canvas class="color-box" width="${W2}" height="${H2}"></canvas>
                    </div>
                `)

            if(!document.querySelector('#ancp-style'))
                (document.head||document.body).appendChild(htmlToDom(`
                        <style id="ancp-style">
                            .a-n-colorpicker-container {
                                position: relative;
                                width: ${W}px;
                                height: ${H}px;
                            }
                            .a-n-colorpicker-container canvas {
                                position: absolute;
                                margin: auto;
                                top: 0;
                                left: 0;
                                right: 0;
                                bottom: 0;
                            }
                        </style>
                    `))

            this.dom = {
                container: dom,
                canvas: dom.querySelector('.color-box'),
                canvasOutside: dom.querySelector('.color-circle'),
            }

            const hsvView = htmlToDom(`<canvas width="${this.dom.canvas.width}" height="${this.dom.canvas.height}"></canvas>`)
            this._hsvView = hsvView
            this._currentHSV = {h:0, s:0, v:0}
            this._isTrusted = true
            this._onChange = e=>{}

            const colorCircle = makeColorCircle(this.dom.canvasOutside.width)
            this._colorCircle = colorCircle
            const ctxOutside = this.dom.canvasOutside.getContext('2d')
            ctxOutside.drawImage(colorCircle.canvas, 0, 0)

            const cW = this.dom.canvas.width
            const cH = this.dom.canvas.height

            const updateCurrentColor = (p, isTrusted) =>{
                p.x = clampOn(0, cW-1, p.x)
                p.y = clampOn(0, cH-1, p.y)

                const [h0,s0,v0] = [this._currentHSV.h, this._currentHSV.s, this._currentHSV.v]
                const s = Math.round(p.x/(cW-1)*255)
                const v = Math.round(255-p.y/(cH-1)*255)
                const [r,g,b] = rgbFrom(h0,s,v)

                updateHsvViewPickedPositionP(this.dom.canvas, hsvView, p)

                this._currentHSV.s = s
                this._currentHSV.v = v

                this._onChange({rgb:[r,g,b], hsv:[h0,s,v], isTrusted})
            }

            this.dom.canvas.addEventListener('mousedown', e=>{
                e.preventDefault()
                const r = e.target.getClientRects()[0]
                const baseX = r.left+window.scrollX
                const baseY = r.top+window.scrollY

                const update = e=>{
                    const p = {x:e.pageX-baseX, y:e.pageY-baseY}
                    updateCurrentColor(p, e.isTrusted&&this._isTrusted)
                }

                update(e)

                const onMove = e=>{
                    e.preventDefault()
                    if(throttle(10))
                        return
                    update(e)
                }
                const onUp = e=>{
                    e.preventDefault()
                    update(e)
                    document.removeEventListener('mousemove', onMove)
                    document.removeEventListener('mouseup', onUp)
                }
                document.addEventListener('mousemove', onMove)
                document.addEventListener('mouseup', onUp)
            })

            const updateColorCircle = (p, isTrusted)=>{
                const cu = colorCircle.cursor(p.x, p.y)
                const h = colorCircle.hueAt(cu.x, cu.y)
                this._redrawColorCircle(cu.x, cu.y)

                ///
                const [h0,s,v] = [this._currentHSV.h, this._currentHSV.s, this._currentHSV.v]
                const [r,g,b] = rgbFrom(h,s,v)
                this._currentHSV.h = h
                drawHsvView(hsvView, h)
                updateHsvViewPickedPosition(this.dom.canvas, hsvView, h,s,v)

                this._onChange({rgb:[r,g,b], hsv:[h,s,v], isTrusted})
            }

            this.dom.canvasOutside.addEventListener('mousedown', e=>{
                e.preventDefault()
                const r = e.target.getClientRects()[0]
                const baseX = r.left+window.scrollX
                const baseY = r.top+window.scrollY

                const update = e =>{
                    const p = {x:e.pageX-baseX, y:e.pageY-baseY}
                    updateColorCircle(p, e.isTrusted&&this._isTrusted)
                }

                update(e)

                const onMove = e=>{
                    e.preventDefault()
                    if(throttle(10))
                        return
                    update(e)
                }
                const onUp = e=>{
                    e.preventDefault()
                    update(e)
                    document.removeEventListener('mousemove', onMove)
                    document.removeEventListener('mouseup', onUp)
                }
                document.addEventListener('mousemove', onMove)
                document.addEventListener('mouseup', onUp)
            })

            // this.setColor(0,0,0)
            this.setColor(255,255,255)
        }

        getContainer(){
            return this.dom.container
        }

        onChange(f){
            this._onChange = f
        }

        setColor(r,g,b){
            const [h,s,v] = hsvFrom(r,g,b)
            this.setColorHsv(h,s,v)

        }
        setColorHsv(h,s,v){
            this._isTrusted = false

            if(s===0)
                h = this._currentHSV.h

            drawHsvView(this._hsvView, h)
            this._updatePickedPosition(h,s,v)
            const cu = this._colorCircle.hueToCursor(h)
            this._redrawColorCircle(cu.x, cu.y)

            this._currentHSV.h = h
            this._currentHSV.s = s
            this._currentHSV.v = v

            const [r,g,b] = rgbFrom(h,s,v).map(v=>clampOn(0, 255, v))
            this._onChange({rgb:[r,g,b], hsv:[h,s,v], isTrusted:this._isTrusted})

            this._isTrusted = true
        }


        _updatePickedPosition(h,s,v){
            updateHsvViewPickedPosition(this.dom.canvas, this._hsvView, h,s,v)
        }
        _redrawColorCircle(x,y){
            const ctxOutside = this.dom.canvasOutside.getContext('2d')
            ctxOutside.clearRect(0,0,this.dom.canvasOutside.width,this.dom.canvasOutside.height)
            ctxOutside.drawImage(this._colorCircle.canvas, 0, 0)

            ctxOutside.strokeStyle='rgba(0,0,0,0.5)'
            ctxOutside.fillStyle='rgba(255,255,255,0.5)'
            ctxOutside.beginPath()
            const radius = 3
            ctxOutside.arc(x, y, radius, 0, Math.PI*2)
            ctxOutside.stroke()
            ctxOutside.fill()
        }
    }

    const htmlToDom = html => document.createRange().createContextualFragment(html.trim()).firstChild

    const clampOn = (min, max, v)=> v<min ? min : v>max ? max : v

    function hsvFrom(r,g,b){
        const max = Math.max(r,g,b)
        const min = Math.min(r,g,b)
        const dm = max-min
        const h_ =   dm===0 ? 0
                  : max===r ? 60*((g-b)/dm)
                  : max===g ? 60*((b-r)/dm)+120
                            : 60*((r-g)/dm)+240
        const h = (h_+360)%360
        const s = max===0 ? 0 : Math.round(dm/max*255)
        const v = max
        return [h,s,v]
    }

    function rgbFrom(h,s,v){
        const max = v
        const min = Math.round(max - s/255*max)
        const dm = max-min
        let r,g,b
        if(h<0)
            throw new Error('invalid h')
        if(h<=60)
            [r,g,b] = [max, h/60*dm+min, min]
        else if(h<=120)
            [r,g,b] = [(120-h)/60*dm+min, max, min]
        else if(h<=180)
            [r,g,b] = [min, max, (h-120)/60*dm+min]
        else if(h<=240)
            [r,g,b] = [min, (240-h)/60*dm+min, max]
        else if(h<=300)
            [r,g,b] = [(h-240)/60*dm+min, min, max]
        else if(h<=360)
            [r,g,b] = [max, min, (360-h)/60*dm+min]
        else
            throw new Error('invalid h')
        r=Math.round(r)
        g=Math.round(g)
        b=Math.round(b)
        return [r,g,b]
    }

    function getColorAt(cnv, x,y){
        x = clampOn(0,cnv.width-1,x)
        y = clampOn(0,cnv.height-1,y)
        const ctx = cnv.getContext('2d')
        const imgd = ctx.getImageData(x,y,1,1)
        const [r,g,b,a] = imgd.data
        return {r,g,b,a}
    }

    function drawHsvView(cnv, h){
        const ctx = cnv.getContext('2d')
        const cW = cnv.width
        const cH = cnv.height

        const imgd = ctx.getImageData(0,0,cW,cH)
        const view = imgd.data
        for(let y=0; y<cH; y++)
            for(let x=0; x<cW; x++) {

                const ss = Math.round(x/cW*255)
                const vv = Math.round((1.0-y/cH)*255)
                const [r2,g2,b2] = rgbFrom(h,ss,vv)

                const idx = (y*cW+x)*4
                view[idx] = r2
                view[idx+1] = g2
                view[idx+2] = b2
                view[idx+3] = 255
            }
        ctx.putImageData(imgd, 0, 0)
    }

    function updateHsvViewPickedPositionP(cnv, hsvView, p){
        const ctx = cnv.getContext('2d')
        ctx.clearRect(0,0,cnv.width,cnv.height)
        ctx.drawImage(hsvView, 0, 0)

        /// display current color location
        ctx.strokeStyle='rgba(0,0,0,0.5)'
        ctx.fillStyle='rgba(255,255,255,0.5)'
        ctx.beginPath()
        const radius = 3
        ctx.arc(Math.round(p.x), Math.round(p.y), radius, 0, Math.PI*2)
        ctx.stroke()
        ctx.fill()
    }
    function updateHsvViewPickedPosition(cnv, hsvView, h,s,v){
        const cW = cnv.width
        const cH = cnv.height
        const p = {x:Math.round(s/255*cW), y:Math.round((255-v)/255*cH)}
        updateHsvViewPickedPositionP(cnv, hsvView, p)
    }

    function makeColorCircle(size, range=[0.75, 0.95]){
        const cW = size
        const cH = size
        const cnv = htmlToDom(`<canvas width="${size}" height="${size}"></canvas>`)
        const ctx = cnv.getContext('2d')

        const r1 = Math.pow(( (cW/2)*range[0] ),2)
        const r2 = Math.pow(( (cW/2)*range[1] ),2)

        const centerX = cW/2
        const centerY = cH/2

        const t0 = Math.PI - Math.PI/2*1/3
        const baseTheta = Math.atan2(Math.sin(t0),Math.cos(t0))

        const cursor = (x,y)=>{
            const dx = x-centerX
            const dy = y-centerY
            const d2 = dx*dx+dy*dy
            const d = Math.sqrt(d2)
            const r = (Math.sqrt(r1)+Math.sqrt(r2))/2
            return {x:r/d*dx+centerX, y:r/d*dy+centerY, insideRange: r1<=d2&&d2<=r2}
        }

        const hueAt = (x,y)=>{
            const t = ((baseTheta + Math.atan2(y-centerY, x-centerX) + 2*Math.PI)%(2*Math.PI))/(2*Math.PI)
            return Math.round(t*360)
        }

        const hueToCursor = h=>{
            const theta = (h%360)/360*2*Math.PI - baseTheta
            const r = (Math.sqrt(r1)+Math.sqrt(r2))/2
            return {x:r*Math.cos(theta)+centerX, y:r*Math.sin(theta)+centerY}
        }

        const imgd = ctx.getImageData(0,0,cW,cH)
        const view = imgd.data
        for(let y=0; y<cH; y++)
            for(let x=0; x<cW; x++) {
                const dist = (x-centerX)*(x-centerX) + (y-centerY)*(y-centerY)
                if(dist >= r1 && dist <= r2) {
                    const [h,s,v] = [hueAt(x,y), 255, 255]
                    const [r2,g2,b2] = rgbFrom(h,s,v)


                    const idx = (y*cW+x)*4
                    view[idx] = r2
                    view[idx+1] = g2
                    view[idx+2] = b2
                    view[idx+3] = 255
                }

            }
        ctx.putImageData(imgd, 0, 0)

        return {
            canvas: cnv,
            size,
            hueAt,
            hueToCursor,
            cursor,
        }
    }

    function throttle(thres=10){
        const t0 = throttle.t || 0
        const t = Date.now()
        if(t-t0 < thres)
            return true
        throttle.t = t
        return false
    }

    return {ANColorPicker}
})()


export {ANColorPicker}
