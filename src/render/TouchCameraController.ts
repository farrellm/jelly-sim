import * as THREE from 'three';

export interface TapEvent {
  clientX: number;
  clientY: number;
  ndcX: number;
  ndcY: number;
}

export interface SphericalCameraState {
  azimuth: number;
  polar: number;
  radius: number;
  targetAzimuth: number;
  targetPolar: number;
  targetRadius: number;
  minDistance: number;
  maxDistance: number;
}

export interface TouchCameraControllerOptions {
  target?: THREE.Vector3;
  framingRadius?: number;
  initialAzimuth?: number;
  initialPolar?: number;
  minPolarAngle?: number;
  maxPolarAngle?: number;
  minZoomFactor?: number;
  maxZoomFactor?: number;
  orbitSpeed?: number;
  wheelZoomSpeed?: number;
  damping?: number;
  tapThresholdPx?: number;
  tapMaxDurationMs?: number;
  onTap?: (tap: TapEvent) => void;
}

interface TrackedPointer {
  x: number;
  y: number;
}

interface TapCandidate {
  pointerId: number;
  startX: number;
  startY: number;
  startTimeMs: number;
}

const DEFAULT_FRAMING_RADIUS = 5.45;
const DEFAULT_INITIAL_AZIMUTH = 0.62;
const DEFAULT_INITIAL_POLAR = 1.12;
const DEFAULT_MIN_POLAR = 0.42;
const DEFAULT_MAX_POLAR = 1.28;
const DEFAULT_MIN_ZOOM_FACTOR = 0.52;
const DEFAULT_MAX_ZOOM_FACTOR = 1.75;
const DEFAULT_ORBIT_SPEED = 0.0068;
const DEFAULT_WHEEL_ZOOM_SPEED = 0.0012;
const DEFAULT_DAMPING = 10.5;
const DEFAULT_TAP_THRESHOLD_PX = 9;
const DEFAULT_TAP_MAX_DURATION_MS = 400;

/**
 * Computes the camera distance required to comfortably frame a sphere of
 * `framingRadius` across both portrait (iPhone 390x844) and landscape viewports.
 */
export function computeResponsiveDistance(
  aspect: number,
  fovDegrees: number,
  framingRadius: number = DEFAULT_FRAMING_RADIUS,
): number {
  const safeAspect = Math.max(0.32, aspect);
  const vHalfRad = THREE.MathUtils.degToRad(fovDegrees * 0.5);
  const tanV = Math.tan(vHalfRad);
  const tanH = tanV * safeAspect;
  const limitingTan = Math.min(tanV, tanH);
  return framingRadius / Math.max(0.08, limitingTan);
}

/**
 * One-finger orbit + two-finger pinch zoom controller with smooth damping and
 * strict tap-vs-drag disambiguation for iPhone Safari and desktop browsers.
 */
export class TouchCameraController {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly element: HTMLElement | null;
  private readonly target: THREE.Vector3;
  private readonly framingRadius: number;
  private readonly initialAzimuth: number;
  private readonly initialPolar: number;
  private readonly minPolarAngle: number;
  private readonly maxPolarAngle: number;
  private readonly minZoomFactor: number;
  private readonly maxZoomFactor: number;
  private readonly orbitSpeed: number;
  private readonly wheelZoomSpeed: number;
  private readonly damping: number;
  private readonly tapThresholdPx: number;
  private readonly tapMaxDurationMs: number;
  private onTap?: (tap: TapEvent) => void;

  private idealDistance: number;
  private minDistance: number;
  private maxDistance: number;

  private azimuth: number;
  private polar: number;
  private radius: number;

  private targetAzimuth: number;
  private targetPolar: number;
  private targetRadius: number;

  private readonly activePointers = new Map<number, TrackedPointer>();
  private tapCandidate: TapCandidate | null = null;
  private tapEligible = false;
  private gestureHadMultiTouch = false;
  private lastPinchDistance: number | null = null;
  private disposed = false;

  constructor(
    camera: THREE.PerspectiveCamera,
    element: HTMLElement | null,
    options: TouchCameraControllerOptions = {},
  ) {
    this.camera = camera;
    this.element = element;
    this.target = (options.target ?? new THREE.Vector3(0, -0.45, 0)).clone();
    this.framingRadius = options.framingRadius ?? DEFAULT_FRAMING_RADIUS;
    this.initialAzimuth = options.initialAzimuth ?? DEFAULT_INITIAL_AZIMUTH;
    this.initialPolar = options.initialPolar ?? DEFAULT_INITIAL_POLAR;
    this.minPolarAngle = options.minPolarAngle ?? DEFAULT_MIN_POLAR;
    this.maxPolarAngle = options.maxPolarAngle ?? DEFAULT_MAX_POLAR;
    this.minZoomFactor = options.minZoomFactor ?? DEFAULT_MIN_ZOOM_FACTOR;
    this.maxZoomFactor = options.maxZoomFactor ?? DEFAULT_MAX_ZOOM_FACTOR;
    this.orbitSpeed = options.orbitSpeed ?? DEFAULT_ORBIT_SPEED;
    this.wheelZoomSpeed = options.wheelZoomSpeed ?? DEFAULT_WHEEL_ZOOM_SPEED;
    this.damping = options.damping ?? DEFAULT_DAMPING;
    this.tapThresholdPx = options.tapThresholdPx ?? DEFAULT_TAP_THRESHOLD_PX;
    this.tapMaxDurationMs = options.tapMaxDurationMs ?? DEFAULT_TAP_MAX_DURATION_MS;
    this.onTap = options.onTap;

    this.idealDistance = computeResponsiveDistance(
      this.camera.aspect || 1,
      this.camera.fov,
      this.framingRadius,
    );
    this.minDistance = this.idealDistance * this.minZoomFactor;
    this.maxDistance = this.idealDistance * this.maxZoomFactor;

    this.azimuth = this.initialAzimuth;
    this.polar = THREE.MathUtils.clamp(
      this.initialPolar,
      this.minPolarAngle,
      this.maxPolarAngle,
    );
    this.radius = this.idealDistance;

    this.targetAzimuth = this.azimuth;
    this.targetPolar = this.polar;
    this.targetRadius = this.radius;

    this.applyCameraTransform();

    if (this.element) {
      this.element.style.touchAction = 'none';
      this.bindEvents(this.element);
    }
  }

  setOnTap(handler: ((tap: TapEvent) => void) | undefined): void {
    this.onTap = handler;
  }

  setAspect(aspect: number): void {
    const prevIdeal = this.idealDistance;
    const zoomRatio = prevIdeal > 0 ? this.targetRadius / prevIdeal : 1;
    const currentRatio = prevIdeal > 0 ? this.radius / prevIdeal : 1;

    this.idealDistance = computeResponsiveDistance(aspect, this.camera.fov, this.framingRadius);
    this.minDistance = this.idealDistance * this.minZoomFactor;
    this.maxDistance = this.idealDistance * this.maxZoomFactor;

    this.targetRadius = THREE.MathUtils.clamp(
      this.idealDistance * zoomRatio,
      this.minDistance,
      this.maxDistance,
    );
    this.radius = THREE.MathUtils.clamp(
      this.idealDistance * currentRatio,
      this.minDistance,
      this.maxDistance,
    );
    this.applyCameraTransform();
  }

  orbitBy(deltaX: number, deltaY: number): void {
    this.targetAzimuth -= deltaX * this.orbitSpeed;
    this.targetPolar = THREE.MathUtils.clamp(
      this.targetPolar - deltaY * this.orbitSpeed * 0.72,
      this.minPolarAngle,
      this.maxPolarAngle,
    );
  }

  applyPinchScale(scaleFactor: number): void {
    if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
      return;
    }
    this.targetRadius = THREE.MathUtils.clamp(
      this.targetRadius * scaleFactor,
      this.minDistance,
      this.maxDistance,
    );
  }

  zoomByDelta(delta: number): void {
    const factor = Math.exp(delta * this.wheelZoomSpeed);
    this.applyPinchScale(factor);
  }

  resetView(immediate = false): void {
    this.targetAzimuth = this.initialAzimuth;
    this.targetPolar = THREE.MathUtils.clamp(
      this.initialPolar,
      this.minPolarAngle,
      this.maxPolarAngle,
    );
    this.targetRadius = this.idealDistance;

    if (immediate) {
      this.azimuth = this.targetAzimuth;
      this.polar = this.targetPolar;
      this.radius = this.targetRadius;
      this.applyCameraTransform();
    }
  }

  update(dtSeconds: number): void {
    const clampedDt = Math.max(0, Math.min(dtSeconds, 0.1));
    const alpha = 1 - Math.exp(-this.damping * clampedDt);

    this.azimuth += (this.targetAzimuth - this.azimuth) * alpha;
    this.polar += (this.targetPolar - this.polar) * alpha;
    this.radius += (this.targetRadius - this.radius) * alpha;

    this.applyCameraTransform();
  }

  getSphericalState(): SphericalCameraState {
    return {
      azimuth: this.azimuth,
      polar: this.polar,
      radius: this.radius,
      targetAzimuth: this.targetAzimuth,
      targetPolar: this.targetPolar,
      targetRadius: this.targetRadius,
      minDistance: this.minDistance,
      maxDistance: this.maxDistance,
    };
  }

  /**
   * Direct gesture hooks exposed for both DOM listeners and deterministic unit tests.
   */
  handlePointerDown(
    pointerId: number,
    clientX: number,
    clientY: number,
    timeMs: number = performance.now(),
  ): void {
    this.activePointers.set(pointerId, { x: clientX, y: clientY });

    if (this.activePointers.size === 1) {
      this.tapCandidate = {
        pointerId,
        startX: clientX,
        startY: clientY,
        startTimeMs: timeMs,
      };
      this.tapEligible = true;
      this.gestureHadMultiTouch = false;
      this.lastPinchDistance = null;
    } else if (this.activePointers.size >= 2) {
      this.tapEligible = false;
      this.gestureHadMultiTouch = true;
      this.lastPinchDistance = this.computePinchDistance();
    }
  }

  handlePointerMove(pointerId: number, clientX: number, clientY: number): void {
    const previous = this.activePointers.get(pointerId);
    if (!previous) {
      return;
    }

    const dx = clientX - previous.x;
    const dy = clientY - previous.y;
    previous.x = clientX;
    previous.y = clientY;

    if (this.activePointers.size === 1) {
      if (this.tapEligible && this.tapCandidate && this.tapCandidate.pointerId === pointerId) {
        const travel = Math.hypot(
          clientX - this.tapCandidate.startX,
          clientY - this.tapCandidate.startY,
        );
        if (travel > this.tapThresholdPx) {
          this.tapEligible = false;
        }
      }

      if (!this.tapEligible) {
        this.orbitBy(dx, dy);
      }
      return;
    }

    if (this.activePointers.size >= 2) {
      this.tapEligible = false;
      this.gestureHadMultiTouch = true;
      const currentDistance = this.computePinchDistance();
      if (
        this.lastPinchDistance !== null &&
        currentDistance !== null &&
        this.lastPinchDistance > 1 &&
        currentDistance > 1
      ) {
        this.applyPinchScale(this.lastPinchDistance / currentDistance);
      }
      this.lastPinchDistance = currentDistance;
    }
  }

  handlePointerEnd(
    pointerId: number,
    clientX: number,
    clientY: number,
    cancelled: boolean,
    timeMs: number = performance.now(),
    rect?: { left: number; top: number; width: number; height: number },
  ): void {
    const shouldEmitTap =
      !cancelled &&
      this.tapEligible &&
      !this.gestureHadMultiTouch &&
      this.activePointers.size === 1 &&
      this.tapCandidate !== null &&
      this.tapCandidate.pointerId === pointerId &&
      timeMs - this.tapCandidate.startTimeMs <= this.tapMaxDurationMs;

    this.activePointers.delete(pointerId);

    if (this.activePointers.size < 2) {
      this.lastPinchDistance = null;
    }

    if (this.activePointers.size === 0) {
      this.tapCandidate = null;
      this.tapEligible = false;
      this.gestureHadMultiTouch = false;
    }

    if (shouldEmitTap && this.onTap) {
      const bounds = rect ?? this.element?.getBoundingClientRect();
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        const ndcX = ((clientX - bounds.left) / bounds.width) * 2 - 1;
        const ndcY = -(((clientY - bounds.top) / bounds.height) * 2 - 1);
        this.onTap({ clientX, clientY, ndcX, ndcY });
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.activePointers.clear();
    if (this.element) {
      this.unbindEvents(this.element);
    }
  }

  private computePinchDistance(): number | null {
    const iterator = this.activePointers.values();
    const first = iterator.next().value;
    const second = iterator.next().value;
    if (!first || !second) {
      return null;
    }
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  private applyCameraTransform(): void {
    const sinPolar = Math.sin(this.polar);
    const x = this.target.x + this.radius * sinPolar * Math.sin(this.azimuth);
    const y = this.target.y + this.radius * Math.cos(this.polar);
    const z = this.target.z + this.radius * sinPolar * Math.cos(this.azimuth);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }

  private readonly onDomPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    if (this.element) {
      try {
        this.element.setPointerCapture(event.pointerId);
      } catch {
        // Ignore synthetic or unsupported pointer capture failures
      }
    }
    this.handlePointerDown(event.pointerId, event.clientX, event.clientY, event.timeStamp);
  };

  private readonly onDomPointerMove = (event: PointerEvent): void => {
    this.handlePointerMove(event.pointerId, event.clientX, event.clientY);
  };

  private readonly onDomPointerUp = (event: PointerEvent): void => {
    this.releaseCaptureSafe(event.pointerId);
    this.handlePointerEnd(event.pointerId, event.clientX, event.clientY, false, event.timeStamp);
  };

  private readonly onDomPointerCancel = (event: PointerEvent): void => {
    this.releaseCaptureSafe(event.pointerId);
    this.handlePointerEnd(event.pointerId, event.clientX, event.clientY, true, event.timeStamp);
  };

  private readonly onDomWheel = (event: WheelEvent): void => {
    event.preventDefault();
    let normalizedDelta = event.deltaY;
    if (event.deltaMode === 1) {
      normalizedDelta *= 16;
    } else if (event.deltaMode === 2) {
      normalizedDelta *= 400;
    }
    this.zoomByDelta(normalizedDelta);
  };

  private readonly onSafariGesture = (event: Event): void => {
    event.preventDefault();
  };

  private releaseCaptureSafe(pointerId: number): void {
    if (!this.element) return;
    try {
      if (this.element.hasPointerCapture(pointerId)) {
        this.element.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore if pointer capture is already released
    }
  }

  private bindEvents(el: HTMLElement): void {
    el.addEventListener('pointerdown', this.onDomPointerDown);
    el.addEventListener('pointermove', this.onDomPointerMove);
    el.addEventListener('pointerup', this.onDomPointerUp);
    el.addEventListener('pointercancel', this.onDomPointerCancel);
    el.addEventListener('wheel', this.onDomWheel, { passive: false });
    el.addEventListener('gesturestart', this.onSafariGesture, { passive: false });
    el.addEventListener('gesturechange', this.onSafariGesture, { passive: false });
  }

  private unbindEvents(el: HTMLElement): void {
    el.removeEventListener('pointerdown', this.onDomPointerDown);
    el.removeEventListener('pointermove', this.onDomPointerMove);
    el.removeEventListener('pointerup', this.onDomPointerUp);
    el.removeEventListener('pointercancel', this.onDomPointerCancel);
    el.removeEventListener('wheel', this.onDomWheel);
    el.removeEventListener('gesturestart', this.onSafariGesture);
    el.removeEventListener('gesturechange', this.onSafariGesture);
  }
}
