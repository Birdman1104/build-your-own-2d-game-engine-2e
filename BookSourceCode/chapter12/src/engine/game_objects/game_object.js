/*
 * File: game_object.js
 *
 * defines the behavior and appearance of a game object
 * 
 */
"use strict";
import BoundingBox from "../utils/bounding_box.js";


class GameObject {

    /**
     * Template for elements of the game that interact with others
     * @constructor GameObject
     * @param {Renderable} renderable - the renderable to be associated with this game object
     * @returns {GameObject} New instance of GameObject
     */
    constructor(renderable) {
        this.mRenderComponent = renderable;
        this.mVisible = true;
        this.mCurrentFrontDir = vec2.fromValues(0, 1);  // this is the current front direction of the object
        this.mRigidBody = null;
        this.mDrawRenderable = true;
        this.mDrawRigidShape = false;
    }
    /**
     * Returns the Transform of the Renderable associated with this gameObject
     * @method
     * @returns {Transform} mRenderComponent - the Transform of this gameObject
     */
    getXform() { return this.mRenderComponent.getXform(); }

    /**
     * Returns the BoundingBox for this gameObject
     * @method
     * @returns {BoundingBox} b - a new copy of the bounding box of this gameObject
     */
    getBBox() {
        let xform = this.getXform();
        let b = new BoundingBox(xform.getPosition(), xform.getWidth(), xform.getHeight());
        return b;
    }

    /**
     * Sets the visibility of this gameObject to true or false
     * @method
     * @param {boolean} f - boolean to set if this gameObject is visibile or not
     */
    setVisibility(f) { this.mVisible = f; }

    /**
     * Returns the visibility of this gameObject
     * @method
     * @returns {boolean} mVisible - the visivility of this gameObject
     */
    isVisible() { return this.mVisible; }

    /**
     * Changes this gameObject's current facing direction
     * @method
     * @param {vec2} f - vector that will be put into mCurrentFrontDir after being normalized
     */
    setCurrentFrontDir(f) { vec2.normalize(this.mCurrentFrontDir, f); }

    /**
     * Returns the front direction of this gameObject
     * @method
     * @returns {vec2} mCurrentFrontDir - the current front direction of this gameObject
     */
    getCurrentFrontDir() { return this.mCurrentFrontDir; }

    /**
     * Returns the renderable associated with this gameObject
     * @returns {Renderable} mRenderComponent - the renderable associated with this gameObject
     */
    getRenderable() { return this.mRenderComponent; }

    /**
     * Sets the rigid body this gameObject will use
     * @method
     * @param {RigidShape} r - the rigid body
     */
    setRigidBody(r) { this.mRigidBody = r; }

    /**
     * Returns the RigidShape of this gameObject 
     * @method
     * @returns {RigidShape} mRigidBody - the RigidShape of this gameObject 
     */
    getRigidBody() { return this.mRigidBody; }

    /**
     * Switches whether this gameObject's renderable is drawn
     * @method
     */
    toggleDrawRenderable() { this.mDrawRenderable = !this.mDrawRenderable; }

    /**
     * Switches whether this gameObject's rigid shape is drawn
     * @method
     */
    toggleDrawRigidShape() { this.mDrawRigidShape = !this.mDrawRigidShape; }
    
    /**
     * Draws this gameObject if it is visible the draw flags are set to true
     * @param {Camera} aCamera  - The camera 
     */
    draw(aCamera) {
        if (this.isVisible()) {
            if (this.mDrawRenderable)
                this.mRenderComponent.draw(aCamera);
            if ((this.mRigidBody !== null) && (this.mDrawRigidShape))
                this.mRigidBody.draw(aCamera);
        }
    }
    /**
     * Updates the rigid body of this gameObject
     * @method
     */
    update() {
        // simple default behavior
        if (this.mRigidBody !== null)
            this.mRigidBody.update();
    }

    // Support for per-pixel collision
    /**
     * Determines if this GameObject has an overlapping pixel with otherObj
     * @param {GameObject} otherObj  - other TextureRenderable 
     * @param {vec2} wcTouchPos  - The world coordinates at which the touching is tested
     * @returns {boolean} pixelTouch - whether this GameOjbect has a pixel overlapping otherObj
     */
    pixelTouches(otherObj, wcTouchPos) {
        // only continue if both objects have getColorArray defined 
        // if defined, should have other texture intersection support!
        let pixelTouch = false;
        let myRen = this.getRenderable();
        let otherRen = otherObj.getRenderable();

        if ((typeof myRen.pixelTouches === "function") && (typeof otherRen.pixelTouches === "function")) {
            if ((myRen.getXform().getRotationInRad() === 0) && (otherRen.getXform().getRotationInRad() === 0)) {
                // no rotation, we can use bbox ...
                let otherBbox = otherObj.getBBox();
                if (otherBbox.intersectsBound(this.getBBox())) {
                    myRen.setColorArray();
                    otherRen.setColorArray();
                    pixelTouch = myRen.pixelTouches(otherRen, wcTouchPos);
                }
            } else {
                // One or both are rotated, compute an encompassing circle
                // by using the hypotenuse as radius
                let mySize = myRen.getXform().getSize();
                let otherSize = otherRen.getXform().getSize();
                let myR = Math.sqrt(0.5 * mySize[0] * 0.5 * mySize[0] + 0.5 * mySize[1] * 0.5 * mySize[1]);
                let otherR = Math.sqrt(0.5 * otherSize[0] * 0.5 * otherSize[0] + 0.5 * otherSize[1] * 0.5 * otherSize[1]);
                let d = [];
                vec2.sub(d, myRen.getXform().getPosition(), otherRen.getXform().getPosition());
                if (vec2.length(d) < (myR + otherR)) {
                    myRen.setColorArray();
                    otherRen.setColorArray();
                    pixelTouch = myRen.pixelTouches(otherRen, wcTouchPos);
                }
            }
        }
        return pixelTouch;
    }
}

export default GameObject;