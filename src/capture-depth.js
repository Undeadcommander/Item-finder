import { Matrix4, Vector3 } from "three";
// Depth is distance along the camera's -Z axis; remap depth-image UVs to view UVs.
export function depthPoint(
  u,
  v,
  meters,
  inverseDepthUV,
  inverseProjection,
  viewTransform,
) {
  const uv = new Vector3(u, v, 0).applyMatrix4(inverseDepthUV);
  const ray = new Vector3(uv.x * 2 - 1, 1 - uv.y * 2, 0.5).applyMatrix4(
    inverseProjection,
  );
  ray.multiplyScalar(meters / -ray.z);
  return ray.applyMatrix4(viewTransform);
}
export async function captureDepth(overlay, onProgress) {
  if (!navigator.xr)
    throw Error(
      "Camera depth scanning needs a WebXR depth-enabled phone and browser. Import a GLB or OBJ scan on this device.",
    );
  let session;
  try {
    session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["depth-sensing", "dom-overlay"],
      depthSensing: {
        usagePreference: ["cpu-optimized"],
        dataFormatPreference: ["float32", "luminance-alpha"],
      },
      domOverlay: { root: overlay },
    });
  } catch (error) {
    if (error.name === "NotAllowedError")
      throw Error(
        "Camera access was not granted. You can try again or import a scan.",
      );
    throw Error(
      "This device or browser does not support WebXR camera depth scanning. Import a GLB or OBJ scan instead.",
    );
  }
  const canvas = document.createElement("canvas");
  let gl, space;
  try {
    gl = canvas.getContext("webgl2", { xrCompatible: true, alpha: true });
    if (!gl) throw Error("WebGL is unavailable.");
    await gl.makeXRCompatible();
    session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
    space = await session.requestReferenceSpace("local");
  } catch (error) {
    await session.end();
    throw error;
  }
  return new Promise((resolve, reject) => {
    const points = [],
      voxels = new Set();
    let frames = 0,
      failed = null,
      cancelled = false,
      ended = false;
    const stop = () => session.end().catch(() => {});
    const cancel = () => {
      cancelled = true;
      stop();
    };
    overlay.querySelector("[data-finish-capture]").onclick = stop;
    overlay.querySelector("[data-cancel-capture]").onclick = cancel;
    session.addEventListener(
      "end",
      () => {
        ended = true;
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        if (cancelled) return resolve(null);
        if (failed) return reject(failed);
        if (points.length < 300)
          return reject(
            Error(
              "Not enough depth data was captured. Scan textured surfaces in good light, or import a scan.",
            ),
          );
        resolve(
          new Blob([new Float32Array(points)], {
            type: "application/octet-stream",
          }),
        );
      },
      { once: true },
    );
    const frame = (_time, xrFrame) => {
      if (ended) return;
      gl.bindFramebuffer(
        gl.FRAMEBUFFER,
        session.renderState.baseLayer.framebuffer,
      );
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      try {
        const pose = xrFrame.getViewerPose(space);
        if (pose && frames++ % 8 === 0) {
          const view = pose.views[0],
            depth = xrFrame.getDepthInformation(view);
          if (depth) {
            const inverseUV = new Matrix4()
              .fromArray(depth.normDepthBufferFromNormView.matrix)
              .invert();
            const projection = new Matrix4()
              .fromArray(view.projectionMatrix)
              .invert();
            const transform = new Matrix4().fromArray(view.transform.matrix);
            const step = Math.max(
              4,
              Math.ceil(Math.max(depth.width, depth.height) / 64),
            );
            for (let y = 0; y < depth.height; y += step)
              for (let x = 0; x < depth.width; x += step) {
                const meters = depth.getDepthInMeters(x, y);
                if (!Number.isFinite(meters) || meters < 0.15 || meters > 8)
                  continue;
                const p = depthPoint(
                  (x + 0.5) / depth.width,
                  (y + 0.5) / depth.height,
                  meters,
                  inverseUV,
                  projection,
                  transform,
                );
                const key = [p.x, p.y, p.z]
                  .map((n) => Math.round(n / 0.03))
                  .join(",");
                if (!voxels.has(key) && points.length < 600_000) {
                  voxels.add(key);
                  points.push(p.x, p.y, p.z);
                }
              }
            onProgress(points.length / 3);
            if (points.length >= 600_000) {
              stop();
              return;
            }
          }
        }
      } catch {
        failed = Error(
          "Depth capture was interrupted. The existing scan has not changed.",
        );
        stop();
        return;
      }
      session.requestAnimationFrame(frame);
    };
    session.requestAnimationFrame(frame);
  });
}
