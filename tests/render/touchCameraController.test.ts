import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  TouchCameraController,
  computeResponsiveDistance,
} from '../../src/render/TouchCameraController';

const IPHONE_RECT = { left: 0, top: 0, width: 390, height: 844 };

describe('TouchCameraController', () => {
  it('computes wider framing distance on iPhone portrait (390x844) than desktop landscape', () => {
    const portraitDist = computeResponsiveDistance(390 / 844, 42, 5.45);
    const landscapeDist = computeResponsiveDistance(1280 / 800, 42, 5.45);

    expect(portraitDist).toBeGreaterThan(landscapeDist * 1.8);

    // At portraitDist, visible horizontal half-width covers the full 4.75 island outer radius
    const tanH = Math.tan(THREE.MathUtils.degToRad(21)) * (390 / 844);
    const visibleHalfWidth = portraitDist * tanH;
    expect(visibleHalfWidth).toBeGreaterThan(4.75);
  });

  it('clamps polar angle and zoom radius within safe diorama bounds', () => {
    const camera = new THREE.PerspectiveCamera(42, 390 / 844, 0.2, 160);
    const controller = new TouchCameraController(camera, null, {
      minPolarAngle: 0.45,
      maxPolarAngle: 1.25,
    });

    controller.orbitBy(0, 10000);
    expect(controller.getSphericalState().targetPolar).toBeCloseTo(0.45, 5);

    controller.orbitBy(0, -10000);
    expect(controller.getSphericalState().targetPolar).toBeCloseTo(1.25, 5);

    const { minDistance, maxDistance } = controller.getSphericalState();
    controller.applyPinchScale(0.01);
    expect(controller.getSphericalState().targetRadius).toBeCloseTo(minDistance, 5);

    controller.applyPinchScale(100);
    expect(controller.getSphericalState().targetRadius).toBeCloseTo(maxDistance, 5);
  });

  it('fires onTap for short stationary taps without orbiting the camera', () => {
    const camera = new THREE.PerspectiveCamera(42, 390 / 844, 0.2, 160);
    const onTap = vi.fn();
    const controller = new TouchCameraController(camera, null, {
      tapThresholdPx: 9,
      onTap,
    });

    const initialAzimuth = controller.getSphericalState().targetAzimuth;

    controller.handlePointerDown(1, 195, 422, 100);
    controller.handlePointerMove(1, 198, 424); // ~3.6px travel, below threshold
    controller.handlePointerEnd(1, 198, 424, false, 180, IPHONE_RECT);

    expect(onTap).toHaveBeenCalledTimes(1);
    const tapArg = onTap.mock.calls[0]?.[0];
    expect(tapArg?.ndcX).toBeCloseTo((198 / 390) * 2 - 1, 4);
    expect(tapArg?.ndcY).toBeCloseTo(-((424 / 844) * 2 - 1), 4);
    expect(controller.getSphericalState().targetAzimuth).toBe(initialAzimuth);
  });

  it('transitions to orbit and suppresses onTap when drag exceeds tapThresholdPx', () => {
    const camera = new THREE.PerspectiveCamera(42, 390 / 844, 0.2, 160);
    const onTap = vi.fn();
    const controller = new TouchCameraController(camera, null, {
      tapThresholdPx: 9,
      onTap,
    });

    const initialAzimuth = controller.getSphericalState().targetAzimuth;

    controller.handlePointerDown(1, 100, 400, 100);
    controller.handlePointerMove(1, 125, 400); // 25px > 9px
    controller.handlePointerMove(1, 165, 390);
    controller.handlePointerEnd(1, 165, 390, false, 220, IPHONE_RECT);

    expect(onTap).not.toHaveBeenCalled();
    expect(controller.getSphericalState().targetAzimuth).toBeLessThan(initialAzimuth);

    // Damped update moves actual camera position smoothly toward target
    const prevPos = camera.position.clone();
    controller.update(0.016);
    expect(camera.position.distanceTo(prevPos)).toBeGreaterThan(0.01);
  });

  it('zooms smoothly on two-finger pinch and never triggers a stray tap on release', () => {
    const camera = new THREE.PerspectiveCamera(42, 390 / 844, 0.2, 160);
    const onTap = vi.fn();
    const controller = new TouchCameraController(camera, null, { onTap });

    const initialRadius = controller.getSphericalState().targetRadius;

    // Place two fingers 100px apart
    controller.handlePointerDown(1, 145, 400, 100);
    controller.handlePointerDown(2, 245, 400, 110);

    // Spread fingers to 150px apart -> zoom IN (radius shrinks)
    controller.handlePointerMove(1, 120, 400);
    controller.handlePointerMove(2, 270, 400);

    expect(controller.getSphericalState().targetRadius).toBeLessThan(initialRadius);

    // Lift both fingers one by one
    controller.handlePointerEnd(2, 270, 400, false, 200, IPHONE_RECT);
    controller.handlePointerEnd(1, 120, 400, false, 220, IPHONE_RECT);

    expect(onTap).not.toHaveBeenCalled();
  });

  it('preserves relative zoom ratio when resizing between portrait and landscape', () => {
    const camera = new THREE.PerspectiveCamera(42, 390 / 844, 0.2, 160);
    const controller = new TouchCameraController(camera, null);

    // Zoom in to 80% of ideal portrait distance
    controller.applyPinchScale(0.8);
    controller.update(2.0);

    const landscapeIdeal = computeResponsiveDistance(1280 / 800, 42, 5.45);
    controller.setAspect(1280 / 800);

    expect(controller.getSphericalState().targetRadius).toBeCloseTo(landscapeIdeal * 0.8, 3);
  });
});
