/*
 * File: camera.js
 *
 * The main camera class definition
 */
"use strict";

import * as glSys from "../core/gl.js";
import BoundingBox from "../utils/bounding_box.js";
import { eBoundCollideStatus } from "../utils/bounding_box.js";

import CameraState from "./camera_state.js";

/**
 * Enum for viewport properties
 * @memberof Camera
 * @enum
 */
const eViewport = Object.freeze({
    eOrgX: 0,
    eOrgY: 1,
    eWidth: 2,
    eHeight: 3
});

class PerRenderCache {
    // Information to be updated once per render for efficiency concerns
    constructor() {
        this.mWCToPixelRatio = 1;  // WC to pixel transformation
        this.mCameraOrgX = 1; // Lower-left corner of camera in WC 
        this.mCameraOrgY = 1;
        this.mCameraPosInPixelSpace = vec3.fromValues(0, 0, 0); //
    }
}

class Camera {
    // wcCenter: is a vec2
    // wcWidth: is the width of the user defined WC
    //      Height of the user defined WC is implicitly defined by the viewport aspect ratio
    //      Please refer to the following
    // viewportRect: an array of 4 elements
    //      [0] [1]: (x,y) position of lower left corner on the canvas (in pixel)
    //      [2]: width of viewport
    //      [3]: height of viewport
    //      
    //  wcHeight = wcWidth * viewport[3]/viewport[2]
    //

    /**
     * Default constructor for Camera object
     * @constructor
     * @param {vec2} wcCenter - center position of Camera in world coordinates
     * @param {float} wcWidth - width of the world, implicitly defines the world height
     * @param {float[]} viewportArray - an array of 4 elements
     *      [0] [1]: (x,y) position of lower left corner on the canvas (in pixel)
     *      [2]: width of viewport
     *      [3]: height of viewport
     * @param {float} bound - viewport border
     * @returns {Camera} a new Camera instance
     */
    constructor(wcCenter, wcWidth, viewportArray, bound) {
        this.mCameraState = new CameraState(wcCenter, wcWidth);
        this.mCameraShake = null;

        this.mViewport = [];  // [x, y, width, height]
        this.mViewportBound = 0;
        if (bound !== undefined) {
            this.mViewportBound = bound;
        }
        this.mScissorBound = [];  // use for bounds
        this.setViewport(viewportArray, this.mViewportBound);

        this.kCameraZ = 10; // this is for illumination computation

        // Camera transform operator
        this.mCameraMatrix = mat4.create();

        // background color
        this.mBGColor = [0.8, 0.8, 0.8, 1]; // RGB and Alpha

        // per-rendering cached information
        // needed for computing transforms for shaders
        // updated each time in SetupViewProjection()
        this.mRenderCache = new PerRenderCache();
            // SHOULD NOT be used except 
            // xform operations during the rendering
            // Client game should not access this!
    }

    // #region Basic getter and setters
    /**
     * Sets the world coordinate center for this Camera
     * @method
     * @param {float} xPos - the new center x value
     * @param {float} yPos - the new center y value
     */
    setWCCenter(xPos, yPos) {
        let p = vec2.fromValues(xPos, yPos);
        this.mCameraState.setCenter(p);
    }
    /**
     * Returns the center world coordinates for this Camera
     * @method
     * @returns {vec2} The center world coordinates
     */
    getWCCenter() { return this.mCameraState.getCenter(); }

    /**
     * Returns the world coordinate center in pixel coordinates
     * @method
     * @returns {vec3} The world coordinate center in pixel coordinates
     */
    getWCCenterInPixelSpace() { return this.mRenderCache.mCameraPosInPixelSpace; }
    /**
     * Sets the world coordinate width of this Camera
     * @method
     * @param {integer} width - The new width for this Camera
     */
    setWCWidth(width) { this.mCameraState.setWidth(width); }
    /**
     * Returns the world coordinate width of this Camera
     * @method
     * @returns {float} The current width of this Camera
     */
    getWCWidth() { return this.mCameraState.getWidth(); }
    /**
     * Returns the world coordinate height of this Camera
     * @method
     * @returns {float} The current height of this Camera
     */
    getWCHeight() {
        // viewportH/viewportW
        let ratio = this.mViewport[eViewport.eHeight] / this.mViewport[eViewport.eWidth];
        return this.mCameraState.getWidth() * ratio;
    }
    /**
     * Sets the Camera viewport
     * @method
     * @param {float[]} viewportArray 
     * @param {float} bound 
     */
    setViewport(viewportArray, bound) {
        if (bound === undefined) {
            bound = this.mViewportBound;
        }
        // [x, y, width, height]
        this.mViewport[0] = viewportArray[0] + bound;
        this.mViewport[1] = viewportArray[1] + bound;
        this.mViewport[2] = viewportArray[2] - (2 * bound);
        this.mViewport[3] = viewportArray[3] - (2 * bound);
        this.mScissorBound[0] = viewportArray[0];
        this.mScissorBound[1] = viewportArray[1];
        this.mScissorBound[2] = viewportArray[2];
        this.mScissorBound[3] = viewportArray[3];
    }
    /**
     * Returns the Camera viewport
     * @method
     * @returns {float[]} Camera viewport [x,y,width,height] 
     */
    getViewport() {
        let out = [];
        out[0] = this.mScissorBound[0];
        out[1] = this.mScissorBound[1];
        out[2] = this.mScissorBound[2];
        out[3] = this.mScissorBound[3];
        return out;
    }

    setBackgroundColor(newColor) { this.mBGColor = newColor; }
    /**
     * Return the background color of this Camera
     * @method
     * @returns {float[]} mBGColor - background color of this Camera
     */
    getBackgroundColor() { return this.mBGColor; }
    // #endregion

    // #region Compute and access camera transform matrix

    // call before you start drawing with this camera
    /**
     * Initializes the camera to begin drawing
     * @method
     */
    setViewAndCameraMatrix() {
        let gl = glSys.get();
        // Step A1: Set up the viewport: area on canvas to be drawn
        gl.viewport(this.mViewport[0],  // x position of bottom-left corner of the area to be drawn
            this.mViewport[1],  // y position of bottom-left corner of the area to be drawn
            this.mViewport[2],  // width of the area to be drawn
            this.mViewport[3]); // height of the area to be drawn
        // Step A2: set up the corresponding scissor area to limit the clear area
        gl.scissor(this.mScissorBound[0], // x position of bottom-left corner of the area to be drawn
            this.mScissorBound[1], // y position of bottom-left corner of the area to be drawn
            this.mScissorBound[2], // width of the area to be drawn
            this.mScissorBound[3]);// height of the area to be drawn

        // Step A3: set the color to be clear
        gl.clearColor(this.mBGColor[0], this.mBGColor[1], this.mBGColor[2], this.mBGColor[3]);  // set the color to be cleared
        // Step A4: enable the scissor area, clear, and then disable the scissor area
        gl.enable(gl.SCISSOR_TEST);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.SCISSOR_TEST);

        // Step B: Compute the Camera Matrix
        let center = [];
        if (this.mCameraShake !== null) {
            center = this.mCameraShake.getCenter();
        } else {
            center = this.getWCCenter();
        }

        // Step B1: following the translation, scale to: (-1, -1) to (1, 1): a 2x2 square at origin
        mat4.scale(this.mCameraMatrix, mat4.create(), vec3.fromValues(2.0 / this.getWCWidth(), 2.0 / this.getWCHeight(), 1.0 / this.kCameraZ));

        // Step B2: first operation to perform is to translate camera center to the origin
        mat4.translate(this.mCameraMatrix, this.mCameraMatrix, vec3.fromValues(-center[0], -center[1], -this.kCameraZ/2.0));
        
        // Step B3: compute and cache per-rendering information
        this.mRenderCache.mWCToPixelRatio = this.mViewport[eViewport.eWidth] / this.getWCWidth();
        this.mRenderCache.mCameraOrgX = center[0] - (this.getWCWidth() / 2);
        this.mRenderCache.mCameraOrgY = center[1] - (this.getWCHeight() / 2);
        let p = this.wcPosToPixel(this.getWCCenter());
        this.mRenderCache.mCameraPosInPixelSpace[0] = p[0];
        this.mRenderCache.mCameraPosInPixelSpace[1] = p[1];
        this.mRenderCache.mCameraPosInPixelSpace[2] = this.fakeZInPixelSpace(this.kCameraZ);
    }

    // Getter for the View-Projection transform operator
    /**
     * Return the transformed Camera matrix
     * @method
     * @returns {mat4} mCameraMatrix - scaled and translated Camera matrix 
     */
    getCameraMatrix() {
        return this.mCameraMatrix;
    }
    // #endregion

    // #region utilities WC bounds: collide and clamp
    // utilities
    /**
     * Detect if parameter Transform collides with the border of this Camera
     * @method
     * @param {Transform} aXform - Transform to detect collision status
     * @param {float} zone - distance from the Camera border to collide with
     * @returns {eBoundCollideStatus} Collision status for aXform and this Camera
     */
    collideWCBound(aXform, zone) {
        let bbox = new BoundingBox(aXform.getPosition(), aXform.getWidth(), aXform.getHeight());
        let w = zone * this.getWCWidth();
        let h = zone * this.getWCHeight();
        let cameraBound = new BoundingBox(this.getWCCenter(), w, h);
        return cameraBound.boundCollideStatus(bbox);
    }

    // prevents the xform from moving outside of the WC boundary.
    // by clamping the aXfrom at the boundary of WC, 
    /**
     * Moves the Transform parameter back inside of the WC boundary
     * @method
     * @param {Transform} aXform - Transform to detect collision and clamp
     * @param {float} zone - distance from the Camera border to collide with
     * @returns {eBoundCollideStatus} Collision status for aXform and this Camera
     */
    clampAtBoundary(aXform, zone) {
        let status = this.collideWCBound(aXform, zone);
        if (status !== eBoundCollideStatus.eInside) {
            let pos = aXform.getPosition();
            if ((status & eBoundCollideStatus.eCollideTop) !== 0) {
                pos[1] = (this.getWCCenter())[1] + (zone * this.getWCHeight() / 2) - (aXform.getHeight() / 2);
            }
            if ((status & eBoundCollideStatus.eCollideBottom) !== 0) {
                pos[1] = (this.getWCCenter())[1] - (zone * this.getWCHeight() / 2) + (aXform.getHeight() / 2);
            }
            if ((status & eBoundCollideStatus.eCollideRight) !== 0) {
                pos[0] = (this.getWCCenter())[0] + (zone * this.getWCWidth() / 2) - (aXform.getWidth() / 2);
            }
            if ((status & eBoundCollideStatus.eCollideLeft) !== 0) {
                pos[0] = (this.getWCCenter())[0] - (zone * this.getWCWidth() / 2) + (aXform.getWidth() / 2);
            }
        }
        return status;
    }
    //#endregion
   
}

export {eViewport}
export default Camera;