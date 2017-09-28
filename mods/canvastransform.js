import {assert, Vector} from './utils.js'

class CanvasTransform {
    constructor(){
        this._pivot = new Vector()
        this._mousePosWindow = new Vector()
        this._matrix = new Matrix()
        this._matrixInv = new Matrix()
        this._domRoot = null
    }

    get translation(){return this._matrix.getTranslation()}
    get rotation(){return this._matrix.getRotation()}
    get zoom(){return Math.abs(this._matrix.getScale()[0])}
    get flipped(){
        const [a,b] = this._matrix.getScale()
        return a*b<0
    }

    activate(transformBaseClassName, canvasClassName){
        if(this._handler)
            return

        // transformBaseClassName='canvas-transform-base'
        // canvasClassName='globalcanvas'
        this.transformBaseClassName = transformBaseClassName
        this.canvasClassName = canvasClassName

        this._handler = e=>{
            this._mousePosWindow.x = e.pageX
            this._mousePosWindow.y = e.pageY

            this._pivot.x = window.pageXOffset + document.body.clientWidth/2
            this._pivot.y = window.pageYOffset + document.body.clientHeight/2
        }
        document.body.addEventListener('mousemove', this._handler) /// #temp
    }

    deactivate(){
        if(!this._handler)
            return
        document.body.removeEventListener('mousemove', this._handler) /// #temp
        this._handler = null
    }

    mousePositionOnWindow(){
        return this._mousePosWindow.clone()
    }

    mousePositionOnCanvas(){
        const mp = this.mousePositionOnWindow()
        const v = this._matrixInv.mulVec(mp)
        v.x = Math.round(v.x)
        v.y = Math.round(v.y)
        return v
    }
    mousePositionOnCanvasRaw(){
        const mp = this.mousePositionOnWindow()
        const v = this._matrixInv.mulVec(mp)
        return v
    }

    getMatrix(){
        return this._matrix.clone()
    }
    setMatrix(v){
        this._matrix = v.clone()
        this._matrixInv = null
    }

    setRootDOM(dom){
        this._domRoot = dom
    }

    // setCanvasSize(){}

    getCanvasBaseDOM(){
        const canvasBase = (this._domRoot || document).getElementsByClassName(this.transformBaseClassName)[0]
        const canvas = (this._domRoot || document).getElementsByClassName(this.canvasClassName)[0]
        return [canvasBase, canvas]
    }

    getTransformPivot(){
        return this._pivot.clone()
    }

    resetTransform(){
        const pv = this.getTransformPivot()
        const m = this._matrix
        m.translate_(-pv.x, -pv.y)
        m.rotate_(-this.rotation)
        m.scale_(1/this.zoom, 1/this.zoom)
        if(this.flipped)
            m.scale_(-1, 1)
        m.seq[0][0] = 1
        m.seq[0][1] = 0
        m.seq[1][0] = 0
        m.seq[1][1] = 1
        m.translate_(pv.x, pv.y)
    }
    resetTransform2(){
        const m = this._matrix
        m.seq[0][0] = 1
        m.seq[0][1] = 0
        m.seq[1][0] = 0
        m.seq[1][1] = 1
        m.seq[0][2] = 0
        m.seq[1][2] = 0
    }

    translate(dp){
        assert(dp instanceof Vector)
        const m = this._matrix
        m.translate_(dp.x, dp.y)
    }

    rotate(angle){
        const pv = this.getTransformPivot()
        const m = this._matrix
        m.translate_(-pv.x, -pv.y)
        m.rotate_(angle)
        m.translate_(pv.x, pv.y)
    }
    // resetRotation(){}

    scale(v){
        const pv = this.getTransformPivot()
        const m = this._matrix
        m.translate_(-pv.x, -pv.y)
        m.scale_(v, v)
        m.translate_(pv.x, pv.y)
    }
    // resetScale(){}

    flipH(){
        const pv = this.getTransformPivot()
        const m = this._matrix

        m.translate_(-pv.x, -pv.y)
        m.scale_(-1, 1)
        m.translate_(pv.x, pv.y)
    }

    update(){
        this._updateWith(this._matrix)
    }

    _updateWith(matrix){
        assert(matrix instanceof Matrix)
        const m = matrix
        const [cBase, cnv] = this.getCanvasBaseDOM()
        cBase.style.transform = matrixToCss(m)
        this._matrix = m
        this._matrixInv = m.invert()
        cnv.style['image-rendering'] = this.zoom >= 1.0 ? 'pixelated' : 'initial'
    }
}





function matrixToCss(m){
    const s = m.seq.map(a=>a.map(n=>Math.round(1000*n)/1000))
    s[0][2] = Math.round(s[0][2])
    s[1][2] = Math.round(s[1][2])
    return `matrix(${s[0][0]},${s[1][0]},${s[0][1]},${s[1][1]},${s[0][2]},${s[1][2]})`
}

class Matrix {
    constructor(mArr=null){
        if(mArr===null){
            mArr = [[1,0,0],
                    [0,1,0],
                    [0,0,1]]
        }
        assert(mArr.length === 3)
        assert(mArr[0].length === 3)
        this._mArr = mArr
    }

    get seq(){return this._mArr}

    toString(){return '\t'+this.seq.map(a=>a.map(n=>Math.round(100*n)/100)
                                            .join(',')
                                  ).join('\n\t') }


    clone(){
        const mArr = this.seq.map(a=>a.concat())
        return new Matrix(mArr)
    }


    isIdentity(){
        return this.seq[0][0] == 1 && this.seq[0][1] == 0 && this.seq[0][2] == 0
            && this.seq[1][0] == 0 && this.seq[1][1] == 1 && this.seq[1][2] == 0
    }
    hasOnlyTranslation(){
        return this.seq[0][0] == 1 && this.seq[0][1] == 0
            && this.seq[1][0] == 0 && this.seq[1][1] == 1
    }
    static forEach(m, callback){
        const li = 3
        const lj = 3
        for(let i=0; i<li; i++)
            for(let j=0; j<lj; j++)
                callback(m.seq[i][j], [i,j])
    }

    _copyFrom(m){
        /// destructive
        Matrix.forEach(this, (_, [i,j])=>{
            this.seq[i][j] = m.seq[i][j]
        })
    }

    mulVec(v){
        assert(v instanceof Vector)
        const s = this.seq
        return new Vector(s[0][0]*v.x + s[0][1]*v.y + s[0][2], s[1][0]*v.x + s[1][1]*v.y + s[1][2])
    }

    mul_(m){
        /// destructive
        const a = this.mul(m)
        this._copyFrom(a)
        return this
    }
    mul(m){
        assert(m instanceof Matrix)
        const mA = this._mArr
        const mB = m._mArr

        const res = this.clone()
        const mC = res._mArr
        Matrix.forEach(this, (_, [i,j])=>{
            let v = 0
            for(let k=0; k<3; k++)
                v += mA[i][k] * mB[k][j]
            if(isNaN(v) || typeof v!=='number')
                throw new Error('invalid result while `Matrix#mul`')
            mC[i][j] = v
        })
        return res
    }

    add_(m){
        Matrix.forEach(this, (v, [i,j])=>{
            this.seq[i][j] += m.seq[i][j]
        })
        return this
    }
    add(m){
        const res = this.clone()
        res.add_(m)
        return res
    }

    scalar_(k){
        Matrix.forEach(this, (_, [i,j])=>{
            this.seq[i][j] *= k
        })
        return this
    }
    scalar(k){
        const res = this.clone()
        res.scalar_(k)
        return res
    }

    transpose_(){
        var a = this.transpose()
        this._copyFrom(a)
        return this
    }
    transpose(){
        var a = new Matrix()
        Matrix.forEach(this, (_, [i,j])=>{
            a.seq[j][i] = this.seq[i][j]
        })
        return a
    }

    det(){
        const s = this.seq
        return s[0][0]*s[1][1]*s[2][2]
              +s[1][0]*s[2][1]*s[0][2]
              +s[2][0]*s[0][1]*s[1][2]
              -s[0][0]*s[1][2]*s[2][1]
              -s[1][0]*s[0][1]*s[2][2]
              -s[2][0]*s[1][1]*s[0][2]
    }

    invert_(){
        const a = this.invert()
        this._copyFrom(a)
        return this
    }
    invert(){
        const d = this.det()
        if(d===0)
            throw new Error('Matrix#invert Error: det === 0')

        const s = this.seq
        return new Matrix([ [ s[1][1]*s[2][2]-s[1][2]*s[2][1], s[0][2]*s[2][1]-s[0][1]*s[2][2], s[0][1]*s[1][2]-s[0][2]*s[1][1] ]
                          , [ s[1][2]*s[2][0]-s[1][0]*s[2][2], s[0][0]*s[2][2]-s[0][2]*s[2][1], s[0][2]*s[1][0]-s[0][0]*s[1][2] ]
                          , [ s[1][0]*s[2][1]-s[1][1]*s[2][0], s[0][1]*s[2][0]-s[0][0]*s[2][1], s[0][0]*s[1][1]-s[0][1]*s[1][0] ]
                          ]).scalar_(1/d)
    }

    translate_(x,y){
        this._copyFrom(this.translate(x,y))
        return this
    }
    translate(x,y){
        assert(typeof x==='number' && typeof y==='number')
        const a = new Matrix([ [1,  0, x]
                             , [0,  1, y]
                             , [0,  0, 1]
                             ])
        return a.mul(this)
    }

    translateAbs_(x,y){
        this._copyFrom(this.translateAbs(x,y))
        return this
    }
    translateAbs(x,y){
        assert(typeof x==='number' && typeof y==='number')
        const a = this.clone()
        a.seq[0][2] = x
        a.seq[1][2] = y
        return a
    }

    rotate_(radian){
        this._copyFrom(this.rotate(radian))
        return this
    }
    rotate(radian){
        const C = Math.cos(radian)
        const S = Math.sin(radian)
        const a = new Matrix([ [C, -S, 0]
                             , [S,  C, 0]
                             , [0,  0, 1]
                             ])
        return a.mul(this)
    }
    scale_(x,y){
        this._copyFrom(this.scale(x,y))
        return this
    }
    scale(x,y){
        const a = new Matrix([ [x,  0, 0]
                             , [0,  y, 0]
                             , [0,  0, 1]
                             ])
        return a.mul(this)
    }
    getTranslation(){
        const s = this.seq
        return new Vector(s[0][2], s[1][2])
    }
    getRotation(){
        const [mT, mR, mS] = this.extractTransformations()
        const angle = Math.atan2(mR.seq[1][0], mR.seq[0][0])
        return angle
    }
    getScale(){
        const [mT, mR, mS] = this.extractTransformations()
        const k1 = mS.seq[0][0]
        const k2 = mS.seq[1][1]
        return [k1,k2]
    }
    extractTransformations(){
        return extractTransformations(this)
    }
}


function extractTransformations(matrix){
    const s=matrix.seq
    const a = s[0][0]
    const b = s[0][1]
    const c = s[1][0]
    const d = s[1][1]

    const tx = s[0][2]
    const ty = s[1][2]


    const k = Math.sqrt(a*a+c*c)
    const k2 = Math.sqrt(b*b+d*d)
    const theta = Math.atan2(-b, d)
    const C = Math.cos(theta)
    const S = Math.sin(theta)
    const flip = isFlipped(matrix) ? -1 : 1
    assert(k===k2, 'not same factor on each axis scale')

    const mT = new Matrix([
                   [1,0,tx]
                 , [0,1,ty]
                 , [0,0, 1]
                 ])
    const mR = new Matrix([
                   [C,-S, 0]
                 , [S, C, 0]
                 , [0, 0, 1]
                 ])
    const mS = new Matrix([
                   [flip*k, 0, 0]
                 , [     0, k, 0]
                 , [     0, 0, 1]
                 ])
    return [mT, mR, mS]
}


function isFlipped(matrix){
    const s=matrix.seq
    const a = s[0][0]
    const b = s[0][1]
    const c = s[1][0]
    const d = s[1][1]

    if( (a===0 && d===0) && ( (b<0 && c<0) || (b>0 && c>0) ) )
        return true
    if( (b===0 && c===0) && ( (a<0 && d>0) || (a>0 && d<0) ) )
        return true

    if( a<0 && b<0 && c<0 && d>0 )
        return true
    if( a>0 && b<0 && c<0 && d<0 )
        return true
    if( a>0 && b>0 && c>0 && d<0 )
        return true
    if( a<0 && b>0 && c>0 && d>0 )
        return true


    return false
}


export {
    CanvasTransform,
}
