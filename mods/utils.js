
function assert(cond,msg){
    if(!cond)
        throw new Error('Assertion failed'+(msg ? ': '+msg : ''))
}


function* range(begin, end=null, step=1){
    if(end===null)
        [begin, end] = [0, begin]
    for (var i=begin; i<end; i+=step)
        yield i
}


function setImmediate(f){setTimeout(f,1)}

function $switch(v,obj){
    const f = obj[v] || obj['default']
    return typeof f === 'function' ? f() : null
}


class ThrottleTime {
    static create(){
        function throttle(thres=10){
            const t0 = throttle.t || 0
            const t = Date.now()
            if(t-t0 < thres)
                return true
            throttle.t = t
            return false
        }
        return throttle
    }
}


function freezed(initObj){
    return new Proxy(initObj, {
        get: function(target, prop) {
            if(!(prop in target))
                throw 'invalid get on freezed object: '+prop
            else
                return target[prop]
        },
        set: function(target, prop, value){
            if(!(prop in target))
                throw 'invalid set on freezed object: '+prop
            target[prop] = value
            return true
        },
    })
}

function tortologyDict(strs){
    /** tortologyDict(`a b c`) /// => Object { 'a':'a', 'b':'b', 'c':'c' } */
    const dict = {}
    for(const v of strs.trim().split(/\s+/g))
        dict[v] = v
    return Object.freeze(dict)
}


class UndoRedoStack {
    constructor(){
        this.cursor = 0
        this._undos = [null]
        this._redos = []

        const minLength = 2
        this.maxLength = Math.max(minLength, 10)
    }

    stack(undoFn, redoFn, redoNow=true){
        this._undos.splice(this.cursor+1, this._undos.length)
        this._redos.splice(this.cursor, this._redos.length)

        this._undos.push(_=>{
            undoFn()
            this.cursor--
            this.clampCursor()
        })
        this._redos.push(_=>{
            redoFn()
            this.cursor++
            this.clampCursor()
        })
        this.cursor++

        if(redoNow)
            redoFn()

        while(this._undos.length > this.maxLength)
            this._undos.splice(1,1)
        while(this._redos.length >= this._undos.length)
            this._redos.shift()
        this.clampCursor()
    }

    clampCursor(){
        this.cursor = Math.max(0, Math.min(this.cursor, this._undos.length-1))
    }
    undo(){
        this._undos[this.cursor] && this._undos[this.cursor]()
    }
    redo(){
        this._redos[this.cursor] && this._redos[this.cursor]()
    }
    forget(){
        this.cursor = 0
        this._undos = [null]
        this._redos = []
    }
}




const gaussBlur = (function(){
    /**
    ref:
    Fastest Gaussian Blur (in linear time)
    http://blog.ivank.net/fastest-gaussian-blur.html
    */
    function gaussBlur_4 (scl, tcl, w, h, r) {
        var bxs = boxesForGauss(r, 3);
        boxBlur_4 (scl, tcl, w, h, (bxs[0]-1)/2);
        boxBlur_4 (tcl, scl, w, h, (bxs[1]-1)/2);
        boxBlur_4 (scl, tcl, w, h, (bxs[2]-1)/2);
    }
    function boxBlur_4 (scl, tcl, w, h, r) {
        for(var i=0; i<scl.length; i++) tcl[i] = scl[i];
        boxBlurH_4(tcl, scl, w, h, r);
        boxBlurT_4(scl, tcl, w, h, r);
    }
    function boxBlurH_4 (scl, tcl, w, h, r) {
        var iarr = 1 / (r+r+1);
        for(var i=0; i<h; i++) {
            var ti = i*w, li = ti, ri = ti+r;
            var fv = scl[ti], lv = scl[ti+w-1], val = (r+1)*fv;
            for(var j=0; j<r; j++) val += scl[ti+j];
            for(var j=0  ; j<=r ; j++) { val += scl[ri++] - fv       ;   tcl[ti++] = Math.round(val*iarr); }
            for(var j=r+1; j<w-r; j++) { val += scl[ri++] - scl[li++];   tcl[ti++] = Math.round(val*iarr); }
            for(var j=w-r; j<w  ; j++) { val += lv        - scl[li++];   tcl[ti++] = Math.round(val*iarr); }
        }
    }
    function boxBlurT_4 (scl, tcl, w, h, r) {
        var iarr = 1 / (r+r+1);
        for(var i=0; i<w; i++) {
            var ti = i, li = ti, ri = ti+r*w;
            var fv = scl[ti], lv = scl[ti+w*(h-1)], val = (r+1)*fv;
            for(var j=0; j<r; j++) val += scl[ti+j*w];
            for(var j=0  ; j<=r ; j++) { val += scl[ri] - fv     ;  tcl[ti] = Math.round(val*iarr);  ri+=w; ti+=w; }
            for(var j=r+1; j<h-r; j++) { val += scl[ri] - scl[li];  tcl[ti] = Math.round(val*iarr);  li+=w; ri+=w; ti+=w; }
            for(var j=h-r; j<h  ; j++) { val += lv      - scl[li];  tcl[ti] = Math.round(val*iarr);  li+=w; ti+=w; }
        }
    }

    function boxesForGauss(sigma, n)  // standard deviation, number of boxes
    {
        var wIdeal = Math.sqrt((12*sigma*sigma/n)+1);  // Ideal averaging filter width
        var wl = Math.floor(wIdeal);  if(wl%2==0) wl--;
        var wu = wl+2;

        var mIdeal = (12*sigma*sigma - n*wl*wl - 4*n*wl - 3*n)/(-4*wl - 4);
        var m = Math.round(mIdeal);
        // var sigmaActual = Math.sqrt( (m*wl*wl + (n-m)*wu*wu - n)/12 );

        var sizes = [];  for(var i=0; i<n; i++) sizes.push(i<m?wl:wu);
        return sizes;
    }


    function gaussBlur(abDest, abSrc, width, height, factor=5){
        /// abDest, abSrc : grayscale
        assert(abDest instanceof ArrayBuffer)
        assert(abSrc instanceof ArrayBuffer)
        assert(abDest.byteLength === abSrc.byteLength)
        assert(abDest.byteLength === width*height)

        const viewSrc = new Uint8Array(abSrc)
        const viewDest = new Uint8Array(abDest)
        gaussBlur_4(viewSrc, viewDest, width, height, factor)
    }

    return gaussBlur
})()


function clone(obj){
    if(obj instanceof ArrayBuffer)
        return obj.slice(0)
    if(obj instanceof Array)
        return obj.concat()

    throw new Error('not clonable: '+obj)
}


class Vector {
    constructor(x=0, y=0){
        this.x = x
        this.y = y
    }
    add(v){return new Vector(this.x+v.x, this.y+v.y)}
    sub(v){return new Vector(this.x-v.x, this.y-v.y)}
    mul(k){return new Vector(this.x*k, this.y*k)}
    dot(v){return this.x*v.x + this.y*v.y}
    distance(){return Math.sqrt(this.dot(this))}
    crossZ(v){return this.x*v.y-this.y*v.x }

    normalized(){
        const l = this.distance()
        return l !== 0 ? this.mul(1/l) : Vector.zero
    }
    clone(){return new this.constructor(this.x, this.y)}

    static get zero(){return new Vector(0,0) }
    static from(pointlikeObj){return new Vector(pointlikeObj.x, pointlikeObj.y) }
    static equals(v1,v2){return v1.x==v2.x && v1.y==v2.y }
}


class Rect {
    constructor(x=0,y=0,width=0,height=0){
        if(width<0 || height<0)
            throw new Error(`Rect Error: invalid size: (${width}/${height})`)
        this.x = x
        this.y = y
        this.width = width
        this.height = height
    }
    move(v){
        assert(v instanceof Vector)
        return new Rect(this.x+v.x, this.y+v.y, this.width, this.height)
    }

    get diag(){
        return new Vector(this.width, this.height)
    }
    get isZeroSize(){return this.width===0 || this.height===0}

    rectPoint(){return new Vector(this.x, this.y)}
    rectSize(){
        const r = this.clone()
        r.x =0
        r.y = 0
        return r
    }

    extendWith(rect){
        assert(rect instanceof Rect)
        const reg = this.toRegion()
        reg.extendWith(rect.toRegion())
        const rec = reg.toRect()
        this.x = rec.x
        this.y = rec.y
        this.width = rec.width
        this.height = rec.height
    }
    trimWith(rect){
        assert(rect instanceof Rect)
        const reg = this.toRegion()
        reg.trimWith(rect.toRegion())
        const rec = reg.toRect()
        this.x = rec.x
        this.y = rec.y
        this.width = rec.width
        this.height = rec.height
    }

    extend(rect){
        const r = this.clone()
        r.extendWith(rect)
        return r
    }
    margin(k){
        const r = this.clone()
        r.x -= k
        r.y -= k
        r.width += 2*k
        r.height += 2*k
        return r
    }

    toRegion(){
        return new Region(this.x, this.y, this.x+this.width,this.y+this.height)
    }

    clone(){return new this.constructor(this.x, this.y, this.width, this.height)}


    static getBound(points){ /// points : Array<IPoint>
        assert(!!points.length)
        const ps = clone(points)
        const head = ps.shift()
        let l = head.x
        let r = head.x
        let t = head.y
        let b = head.y
        for(const p of ps) {
            if(p.x < l)
                l = p.x
            if(p.x > r)
                r = p.x
            if(p.y < t)
                t = p.y
            if(p.y > b)
                b = p.y
        }
        return new this(l,t, r-l, b-t)
    }
    static round(rect){
        return new Rect(Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height))
    }

    static equals(r1,r2){return r1.x==r2.x && r1.y==r2.y && r1.width==r2.width && r1.height==r2.height }
}

class Region {
    constructor(left, top, right, bottom){
        this.left = left
        this.top = top
        this.right = right
        this.bottom = bottom

        this._validate()
    }

    _validate(){
        if(this.right<this.left)
            throw new Error(`Region Error: right<left (left:${this.left} / right:${this.right})`)
        if(this.bottom<this.top)
            throw new Error(`Region Error: bottom<top (top:${this.top} / bottom:${this.bottom})`)
    }

    clone(){return new this.constructor(this.left, this.top, this.right, this.bottom)}


    extendWith(region){
        assert(region instanceof Region)

        if(this.left > region.left)
            this.left = region.left
        if(this.right < region.right)
            this.right = region.right
        if(this.top > region.top)
            this.top = region.top
        if(this.bottom < region.bottom)
            this.bottom = region.bottom
    }

    trimWith(region){
        assert(region instanceof Region)

        if(this.right < region.left || region.right < this.left){
            this.left = this.right = region.left
        }else{
            if(this.left < region.left)
                this.left = region.left
            if(this.right > region.right)
                this.right = region.right
        }
        if(this.bottom < region.top || region.bottom < this.top){
            this.top = this.bottom = region.top
        }else{
            if(this.top < region.top)
                this.top = region.top
            if(this.bottom > region.bottom)
                this.bottom = region.bottom
        }

        if(this.right < this.left)
            this.right = this.left
        if(this.bottom < this.top)
            this.bottom = this.top

        this._validate()
    }

    toRect(){
        return new Rect(this.left, this.top, this.right-this.left, this.bottom-this.top)
    }

    getCorners(){
        return [ new Vector(this.left, this.top)
               , new Vector(this.right, this.top)
               , new Vector(this.right, this.bottom)
               , new Vector(this.left, this.bottom)
               ]
    }

    static getBound(points){ /// points : Array<IPoint>
        assert(!!points.length)
        const ps = clone(points)
        const head = ps.shift()
        let l = head.x
        let r = head.x
        let t = head.y
        let b = head.y
        for(const p of ps) {
            if(p.x < l)
                l = p.x
            if(p.x > r)
                r = p.x
            if(p.y < t)
                t = p.y
            if(p.y > b)
                b = p.y
        }
        return new this(l,t, r, b)
    }
}


export {
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
    Rect,
    Region,
}
