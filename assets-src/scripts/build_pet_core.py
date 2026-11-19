"""Build PR-04 Hero Pet & Core Care Asset Pack via Blender MCP.

Generates:
  - assets-src/blend/pet_core.blend
  - public/assets/models/jellybean_larva.glb   (<= 1,200 tris, <= 45 KB)
  - public/assets/models/starter_house.glb     (<= 1,500 tris, <= 65 KB)
  - public/assets/models/apple.glb             (<= 400 tris,   <= 20 KB)
  - public/assets/models/bed_prop.glb          (<= 400 tris,   <= 20 KB)
  - public/assets/icons/larva.png              (128x128 transparent PNG)
  - public/assets/icons/apple.png              (128x128 transparent PNG)
  - public/assets/icons/bed.png                (128x128 transparent PNG)

Can be executed inside Blender MCP (`execute_blender_code`) or headless via:
    blender --background --python assets-src/scripts/build_pet_core.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import common  # noqa: E402


# ---------------------------------------------------------------------------
# Small Geometry Helpers
# ---------------------------------------------------------------------------

def _add_box(
    bm: bmesh.types.BMesh,
    size_xyz: tuple[float, float, float],
    center_xyz: tuple[float, float, float],
    mat_idx: int,
    rot_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> list[bmesh.types.BMFace]:
    """Append an axis-aligned or rotated box to `bm` and tag its material slot."""
    xform = (
        Matrix.Translation(center_xyz)
        @ Euler(rot_euler, "XYZ").to_matrix().to_4x4()
        @ Matrix.Diagonal((size_xyz[0], size_xyz[1], size_xyz[2], 1.0))
    )
    ret = bmesh.ops.create_cube(bm, size=1.0, matrix=xform)
    faces = list({f for v in ret["verts"] for f in v.link_faces})
    for f in faces:
        f.material_index = mat_idx
    return faces


def _add_cylinder(
    bm: bmesh.types.BMesh,
    segments: int,
    radius1: float,
    radius2: float,
    depth: float,
    center_xyz: tuple[float, float, float],
    mat_idx: int,
    rot_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
    smooth: bool = False,
) -> list[bmesh.types.BMFace]:
    """Append a capped cylinder/cone to `bm`."""
    xform = (
        Matrix.Translation(center_xyz)
        @ Euler(rot_euler, "XYZ").to_matrix().to_4x4()
    )
    ret = bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        matrix=xform,
    )
    faces = list({f for v in ret["verts"] for f in v.link_faces})
    for f in faces:
        f.material_index = mat_idx
        f.smooth = smooth
    return faces


def _add_uvsphere(
    bm: bmesh.types.BMesh,
    u_segments: int,
    v_segments: int,
    radius: float,
    center_xyz: tuple[float, float, float],
    scale_xyz: tuple[float, float, float],
    mat_idx: int,
    rot_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
    smooth: bool = True,
) -> list[bmesh.types.BMFace]:
    """Append a transformed UV sphere to `bm`."""
    xform = (
        Matrix.Translation(center_xyz)
        @ Euler(rot_euler, "XYZ").to_matrix().to_4x4()
        @ Matrix.Diagonal((scale_xyz[0], scale_xyz[1], scale_xyz[2], 1.0))
    )
    ret = bmesh.ops.create_uvsphere(
        bm,
        u_segments=u_segments,
        v_segments=v_segments,
        radius=radius,
        matrix=xform,
    )
    faces = list({f for v in ret["verts"] for f in v.link_faces})
    for f in faces:
        f.material_index = mat_idx
        f.smooth = smooth
    return faces


def _build_curved_tube(
    bm: bmesh.types.BMesh,
    points: list[Vector],
    radii: list[float],
    tube_segs: int,
    mat_idx: int,
    smooth: bool = True,
) -> list[bmesh.types.BMFace]:
    """Build a closed curved tube along `points` with per-point radii."""
    rings: list[list[bmesh.types.BMVert]] = []
    n_pts = len(points)
    for i, pt in enumerate(points):
        if i == 0:
            tangent = (points[1] - points[0]).normalized()
        elif i == n_pts - 1:
            tangent = (points[-1] - points[-2]).normalized()
        else:
            tangent = (points[i + 1] - points[i - 1]).normalized()

        ref = Vector((0.0, 0.0, 1.0))
        if abs(tangent.dot(ref)) > 0.92:
            ref = Vector((1.0, 0.0, 0.0))
        binorm = tangent.cross(ref).normalized()
        norm = binorm.cross(tangent).normalized()

        r = radii[i]
        ring: list[bmesh.types.BMVert] = []
        for k in range(tube_segs):
            ang = (2.0 * math.pi * k) / tube_segs
            offset = r * (math.cos(ang) * norm + math.sin(ang) * binorm)
            ring.append(bm.verts.new(pt + offset))
        rings.append(ring)

    faces: list[bmesh.types.BMFace] = []
    for i in range(n_pts - 1):
        ra = rings[i]
        rb = rings[i + 1]
        for k in range(tube_segs):
            kn = (k + 1) % tube_segs
            f = bm.faces.new((ra[k], rb[k], rb[kn], ra[kn]))
            f.material_index = mat_idx
            f.smooth = smooth
            faces.append(f)

    f_start = bm.faces.new(list(reversed(rings[0])))
    f_start.material_index = mat_idx
    f_start.smooth = smooth
    faces.append(f_start)

    f_end = bm.faces.new(rings[-1])
    f_end.material_index = mat_idx
    f_end.smooth = smooth
    faces.append(f_end)
    return faces


def _create_multimat_mesh_object(
    name: str,
    bm: bmesh.types.BMesh,
    collection: bpy.types.Collection,
    materials: list[bpy.types.Material],
) -> bpy.types.Object:
    """Create a mesh object preserving per-face material_index and smooth flags."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for mat in materials:
        mesh.materials.append(mat)
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


# ---------------------------------------------------------------------------
# 1. Larva-Stage Jelly Bean (jellybean_larva.glb)
# ---------------------------------------------------------------------------

def build_jellybean_larva(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build the Larva-stage Jelly Bean with separate Body, Eyes, Brows, Mouth, Cheeks.

    Hierarchy (root at ground-center (0, 0, 0), front facing -Y in Blender -> +Z in Three.js):
      jellybean_larva (Empty)
        ├── Body        (Mesh, glossy candy glaze — re-tintable per flavor)
        ├── Eyes        (Empty at eye center for blink scaling)
        │    ├── Eye_L  (Mesh: glossy licorice eye + dual white catchlights)
        │    └── Eye_R  (Mesh: glossy licorice eye + dual white catchlights)
        ├── Brows       (Empty at brow center)
        │    ├── Brow_L (Mesh: expressive pill brow)
        │    └── Brow_R (Mesh: expressive pill brow)
        ├── Mouth       (Mesh at mouth center for talk/eat/cry scaling)
        ├── Cheeks      (Mesh: rosy blush cheeks)
        └── HatSocket   (Empty at top crown)
    """
    root = bpy.data.objects.new("jellybean_larva", None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.25
    root.location = (0.0, 0.0, 0.0)
    collection.objects.link(root)

    # 1. Glossy plump baby larva droplet body (18x12 UV sphere -> 396 tris)
    bm_body = bmesh.new()
    bmesh.ops.create_uvsphere(bm_body, u_segments=18, v_segments=12, radius=1.0)
    for v in bm_body.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        t = (z + 1.0) * 0.5  # 0 at bottom, 1 at top

        # Cute chubby teardrop-grub profile: wide cozy belly, slightly narrower top head
        width_x = 0.275 * (1.08 - 0.20 * t + 0.09 * math.sin(math.pi * t))
        depth_y = 0.265 * (1.06 - 0.16 * t + 0.08 * math.sin(math.pi * t))

        # Subtle baby-larva tail cushion extending gently toward +Y (back) near bottom
        tail_bump = 0.0
        if y > 0.0:
            tail_bump = 0.115 * (y ** 1.4) * math.exp(-((t - 0.26) / 0.28) ** 2)

        # Gentle cozy forward tilt of the upper head toward -Y (front)
        head_lean_y = -0.042 * (t ** 1.5)

        # Slightly flattened cozy resting base so larva sits flush on ground
        z_shaped = z
        if z < -0.58:
            z_shaped = -0.58 + (z + 0.58) * 0.48

        v.co.x = x * width_x
        v.co.y = y * depth_y + tail_bump + head_lean_y
        v.co.z = z_shaped * 0.315

    # Shift body vertices so base sits strictly at Z = 0.0 and X is centered
    min_z = min(v.co.z for v in bm_body.verts)
    for v in bm_body.verts:
        v.co.z -= min_z

    mat_jelly = common.get_or_create_material("jelly_cherry")
    body = common.create_mesh_object("Body", bm_body, collection, material=mat_jelly, smooth=True)
    body.parent = root
    body.location = (0.0, 0.0, 0.0)

    bpy.context.view_layer.update()
    body_max_z = max(v.co.z for v in body.data.vertices)

    def _front_surface(x: float, z: float, push_out: float = 0.0) -> tuple[Vector, Vector]:
        """Raycast from front (-Y) onto Body to seat facial parts flush on the curved surface."""
        hit, loc, normal, _ = body.ray_cast(Vector((x, -1.5, z)), Vector((0.0, 1.0, 0.0)))
        if not hit:
            return Vector((x, -0.25 - push_out, z)), Vector((0.0, -1.0, 0.0))
        return loc + normal * push_out, normal

    mat_eye = common.get_or_create_material("eye_licorice")
    mat_shine = common.get_or_create_material("eye_highlight")
    mat_brow = common.get_or_create_material("brow_licorice")
    mat_cheek = common.get_or_create_material("cheek_blush")

    # 2. Eyes group (Empty parent at eye center so scaling Eyes.z / Y blinks cleanly)
    eye_z = body_max_z * 0.56
    eye_x_abs = 0.118
    eye_center_pt, _ = _front_surface(0.0, eye_z, push_out=0.0)

    eyes_empty = bpy.data.objects.new("Eyes", None)
    eyes_empty.empty_display_type = "PLAIN_AXES"
    eyes_empty.empty_display_size = 0.12
    eyes_empty.parent = root
    eyes_empty.location = (0.0, eye_center_pt.y, eye_z)
    collection.objects.link(eyes_empty)

    eye_objects: list[bpy.types.Object] = []
    for side, sgn in (("L", -1.0), ("R", 1.0)):
        eye_pos, eye_norm = _front_surface(sgn * eye_x_abs, eye_z, push_out=0.008)
        bm_eye = bmesh.new()
        # Oversized glossy baby eye (10x8 UV sphere -> 140 tris)
        _add_uvsphere(
            bm_eye,
            u_segments=10,
            v_segments=8,
            radius=0.068,
            center_xyz=(0.0, 0.0, 0.0),
            scale_xyz=(0.94, 0.52, 1.06),
            mat_idx=0,
            smooth=True,
        )
        # Main upper catchlight sparkle (8x4 UV sphere -> 48 tris)
        _add_uvsphere(
            bm_eye,
            u_segments=8,
            v_segments=4,
            radius=0.023,
            center_xyz=(0.018, -0.032, 0.024),
            scale_xyz=(1.0, 0.65, 1.0),
            mat_idx=1,
            smooth=True,
        )
        # Tiny secondary lower catchlight (6x4 UV sphere -> 36 tris)
        _add_uvsphere(
            bm_eye,
            u_segments=6,
            v_segments=4,
            radius=0.011,
            center_xyz=(-0.016, -0.034, -0.020),
            scale_xyz=(1.0, 0.65, 1.0),
            mat_idx=1,
            smooth=True,
        )
        eye_obj = _create_multimat_mesh_object(
            f"Eye_{side}", bm_eye, collection, [mat_eye, mat_shine]
        )
        eye_obj.parent = eyes_empty
        # Position relative to eyes_empty
        eye_obj.location = eye_pos - Vector(eyes_empty.location)
        # Subtle outward yaw to follow curved bean face
        yaw = math.atan2(eye_norm.x, -eye_norm.y) * 0.55
        pitch = math.atan2(eye_norm.z, math.hypot(eye_norm.x, eye_norm.y)) * 0.35
        eye_obj.rotation_euler = Euler((pitch, 0.0, yaw), "XYZ")
        eye_objects.append(eye_obj)

    # 3. Brows group (Empty parent + Brow_L, Brow_R for expressive worried/angry/happy tilts)
    brow_z = body_max_z * 0.725
    brow_x_abs = 0.118
    brow_center_pt, _ = _front_surface(0.0, brow_z, push_out=0.010)

    brows_empty = bpy.data.objects.new("Brows", None)
    brows_empty.empty_display_type = "PLAIN_AXES"
    brows_empty.empty_display_size = 0.12
    brows_empty.parent = root
    brows_empty.location = (0.0, brow_center_pt.y, brow_z)
    collection.objects.link(brows_empty)

    brow_objects: list[bpy.types.Object] = []
    for side, sgn in (("L", -1.0), ("R", 1.0)):
        brow_pos, brow_norm = _front_surface(sgn * brow_x_abs, brow_z, push_out=0.010)
        bm_brow = bmesh.new()
        # Cute plump mini-arc brow pill (4 points, 6-sided tube -> ~40 tris)
        brow_pts = [
            Vector((-0.036, 0.005, -0.006)),
            Vector((-0.012, -0.003, 0.004)),
            Vector((0.012, -0.003, 0.004)),
            Vector((0.036, 0.005, -0.006)),
        ]
        brow_rads = [0.008, 0.013, 0.013, 0.008]
        _build_curved_tube(bm_brow, brow_pts, brow_rads, tube_segs=6, mat_idx=0, smooth=True)
        brow_obj = _create_multimat_mesh_object(f"Brow_{side}", bm_brow, collection, [mat_brow])
        brow_obj.parent = brows_empty
        brow_obj.location = brow_pos - Vector(brows_empty.location)
        yaw = math.atan2(brow_norm.x, -brow_norm.y) * 0.6
        # Gentle friendly outer lift on neutral pose
        roll = sgn * math.radians(6.0)
        brow_obj.rotation_euler = Euler((0.0, roll, yaw), "XYZ")
        brow_objects.append(brow_obj)

    # 4. Mouth mesh (origin at mouth center so scaling animates talking/feeding/crying)
    mouth_z = body_max_z * 0.375
    mouth_pos, _ = _front_surface(0.0, mouth_z, push_out=0.010)
    bm_mouth = bmesh.new()
    mouth_steps = 6
    mouth_pts: list[Vector] = []
    mouth_rads: list[float] = []
    for s in range(mouth_steps + 1):
        u = -1.0 + 2.0 * (s / mouth_steps)
        mx = u * 0.058
        my = 0.014 * (u * u)
        mz = -0.014 + 0.028 * (u * u)
        mouth_pts.append(Vector((mx, my, mz)))
        taper = math.sqrt(max(0.30, 1.0 - 0.72 * (u * u) ** 2))
        mouth_rads.append(0.0135 * taper)
    _build_curved_tube(bm_mouth, mouth_pts, mouth_rads, tube_segs=6, mat_idx=0, smooth=True)
    mouth_obj = _create_multimat_mesh_object("Mouth", bm_mouth, collection, [mat_eye])
    mouth_obj.parent = root
    mouth_obj.location = mouth_pos

    # 5. Rosy Blush Cheeks mesh (kept separate from Body so flavor tinting preserves pink blush)
    cheek_z = body_max_z * 0.42
    cheek_x_abs = 0.172
    bm_cheeks = bmesh.new()
    for sgn in (-1.0, 1.0):
        c_pos, c_norm = _front_surface(sgn * cheek_x_abs, cheek_z, push_out=0.005)
        yaw = math.atan2(c_norm.x, -c_norm.y) * 0.7
        _add_uvsphere(
            bm_cheeks,
            u_segments=8,
            v_segments=4,
            radius=0.044,
            center_xyz=(c_pos.x, c_pos.y, c_pos.z),
            scale_xyz=(1.15, 0.36, 0.72),
            mat_idx=0,
            rot_euler=(0.0, 0.0, yaw),
            smooth=True,
        )
    cheeks_obj = _create_multimat_mesh_object("Cheeks", bm_cheeks, collection, [mat_cheek])
    cheeks_obj.parent = root
    cheeks_obj.location = (0.0, 0.0, 0.0)

    # 6. HatSocket Empty at crown for future cosmetics/blanket alignment
    hat_socket = bpy.data.objects.new("HatSocket", None)
    hat_socket.empty_display_type = "SPHERE"
    hat_socket.empty_display_size = 0.06
    hat_socket.parent = root
    hat_socket.location = (0.0, -0.025, body_max_z - 0.01)
    collection.objects.link(hat_socket)

    return [
        root,
        body,
        eyes_empty,
        *eye_objects,
        brows_empty,
        *brow_objects,
        mouth_obj,
        cheeks_obj,
        hat_socket,
    ]


# ---------------------------------------------------------------------------
# 2. Starter House (starter_house.glb)
# ---------------------------------------------------------------------------

def _add_arched_window(
    bm: bmesh.types.BMesh,
    center: Vector,
    rot_z: float,
    mat_glass: int,
    mat_frame: int,
    mat_box: int,
    mat_flower: int,
    add_flower_box: bool = True,
) -> None:
    """Add a cute rounded-frame glowing cottage window on a wall face (local front is -Y)."""
    rot_m = Matrix.Translation(center) @ Matrix.Rotation(rot_z, 4, "Z")

    def _put_box(sx: float, sy: float, sz: float, lx: float, ly: float, lz: float, mi: int) -> None:
        m = rot_m @ Matrix.Translation((lx, ly, lz)) @ Matrix.Diagonal((sx, sy, sz, 1.0))
        ret = bmesh.ops.create_cube(bm, size=1.0, matrix=m)
        for v in ret["verts"]:
            for f in v.link_faces:
                f.material_index = mi
                f.smooth = False

    # Warm glowing window pane
    _put_box(0.24, 0.03, 0.25, 0.0, -0.015, 0.0, mat_glass)
    # Outer frame rails (top, bottom, left, right)
    _put_box(0.29, 0.05, 0.035, 0.0, -0.025, 0.13, mat_frame)
    _put_box(0.31, 0.065, 0.04, 0.0, -0.032, -0.135, mat_frame)
    _put_box(0.035, 0.05, 0.25, -0.125, -0.025, 0.0, mat_frame)
    _put_box(0.035, 0.05, 0.25, 0.125, -0.025, 0.0, mat_frame)
    # Cross mullions
    _put_box(0.022, 0.04, 0.24, 0.0, -0.024, 0.0, mat_frame)
    _put_box(0.24, 0.04, 0.022, 0.0, -0.024, 0.0, mat_frame)

    if add_flower_box:
        _put_box(0.28, 0.085, 0.075, 0.0, -0.058, -0.185, mat_box)
        # Three little candy-blossom buds in the window box
        for bx in (-0.08, 0.0, 0.08):
            m = (
                rot_m
                @ Matrix.Translation((bx, -0.06, -0.132))
                @ Matrix.Diagonal((0.036, 0.034, 0.032, 1.0))
            )
            ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0, matrix=m)
            for v in ret["verts"]:
                for f in v.link_faces:
                    f.material_index = mat_flower
                    f.smooth = False


def build_starter_house(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build the pastel gingerbread-island Starter House with a separate FrontDoor mesh.

    Fits comfortably on a Ring 0 plot pad (r=0.86m), front door facing -Y (Three.js +Z).
    """
    mat_wall = common.get_or_create_material("cottage_wall")
    mat_roof = common.get_or_create_material("cottage_roof")
    mat_frosting = common.get_or_create_material("cream_frosting")
    mat_wood = common.get_or_create_material("wood_wafer")
    mat_biscuit = common.get_or_create_material("cliff_biscuit")
    mat_chimney = common.get_or_create_material("cottage_chimney")
    mat_window = common.get_or_create_material(
        "window_glow", emission_hex="#FFE380", emission_strength=0.45
    )
    mat_flower = common.get_or_create_material("flower_strawberry")
    mat_door = common.get_or_create_material("cottage_door")
    mat_gold = common.get_or_create_material("brass_gold")

    # Material indices for starter_house main mesh:
    # 0: wall, 1: roof, 2: frosting, 3: wood, 4: biscuit, 5: chimney, 6: window, 7: flower
    house_mats = [
        mat_wall,
        mat_roof,
        mat_frosting,
        mat_wood,
        mat_biscuit,
        mat_chimney,
        mat_window,
        mat_flower,
    ]
    bm = bmesh.new()

    # 1. Foundation plinth (Z = 0.0 .. 0.11)
    _add_box(bm, (1.18, 1.06, 0.11), (0.0, 0.0, 0.055), mat_idx=4)

    # 2. Main cottage body with gable peaks along Y (front -Y, back +Y)
    #    Wall footprint: X in [-0.54, +0.54], Y in [-0.48, +0.48], eave Z=0.78, gable peak Z=1.30
    wx, wy = 0.54, 0.48
    z_bot, z_eave, z_peak = 0.11, 0.78, 1.30
    # 10 vertices (5 on front face, 5 on back face)
    f_bl = bm.verts.new((-wx, -wy, z_bot))
    f_br = bm.verts.new((wx, -wy, z_bot))
    f_tr = bm.verts.new((wx, -wy, z_eave))
    f_pk = bm.verts.new((0.0, -wy, z_peak))
    f_tl = bm.verts.new((-wx, -wy, z_eave))

    b_bl = bm.verts.new((-wx, wy, z_bot))
    b_br = bm.verts.new((wx, wy, z_bot))
    b_tr = bm.verts.new((wx, wy, z_eave))
    b_pk = bm.verts.new((0.0, wy, z_peak))
    b_tl = bm.verts.new((-wx, wy, z_eave))

    wall_faces = [
        bm.faces.new((f_bl, f_br, f_tr, f_pk, f_tl)),  # front gable wall
        bm.faces.new((b_br, b_bl, b_tl, b_pk, b_tr)),  # back gable wall
        bm.faces.new((b_bl, f_bl, f_tl, b_tl)),        # left wall
        bm.faces.new((f_br, b_br, b_tr, f_tr)),        # right wall
        bm.faces.new((f_tl, f_pk, b_pk, b_tl)),        # left roof deck
        bm.faces.new((f_pk, f_tr, b_tr, b_pk)),        # right roof deck
    ]
    for f in wall_faces:
        f.material_index = 0
        f.smooth = False

    # Chunky wafer-wood corner posts & frosting waist trim
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            _add_box(bm, (0.085, 0.085, 0.70), (sx * 0.53, sy * 0.47, 0.45), mat_idx=3)
    _add_box(bm, (1.15, 1.03, 0.055), (0.0, 0.0, 0.135), mat_idx=2)

    # 3. Thick pitched strawberry-candy roof slabs (overhanging front/back/sides)
    # Slope vector from peak (0, z_peak) to eave (wx, z_eave): dx=0.54, dz=-0.52 -> angle ~43.9 deg
    slope_angle = math.atan2(z_peak - z_eave, wx)
    slope_len = math.hypot(wx + 0.16, (z_peak - z_eave) * ((wx + 0.16) / wx))
    roof_depth = 1.24
    roof_thick = 0.095

    for side_sgn in (-1.0, 1.0):
        mid_x = side_sgn * 0.35
        mid_z = z_peak + 0.045 - 0.35 * math.tan(slope_angle)
        rot_y = side_sgn * slope_angle
        # Main pink roof slope
        _add_box(
            bm,
            (slope_len, roof_depth, roof_thick),
            (mid_x, 0.0, mid_z),
            mat_idx=1,
            rot_euler=(0.0, rot_y, 0.0),
        )
        # Cream-frosting front & back gable trim strips
        for fy_sgn in (-1.0, 1.0):
            _add_box(
                bm,
                (slope_len + 0.03, 0.075, roof_thick + 0.035),
                (mid_x, fy_sgn * (roof_depth * 0.5 - 0.015), mid_z + 0.012),
                mat_idx=2,
                rot_euler=(0.0, rot_y, 0.0),
            )
        # Cream-frosting lower eave lip
        eave_x = side_sgn * (wx + 0.155)
        eave_z = z_peak + 0.045 - (wx + 0.155) * math.tan(slope_angle)
        _add_box(
            bm,
            (0.08, roof_depth + 0.04, 0.085),
            (eave_x, 0.0, eave_z),
            mat_idx=2,
            rot_euler=(0.0, rot_y, 0.0),
        )

    # Cream frosting roof ridge beam seated cleanly into the gable trim
    _add_box(bm, (0.11, roof_depth + 0.015, 0.095), (0.0, 0.0, z_peak + 0.062), mat_idx=2)

    # 4. Cozy Hearth Chimney on right roof slope
    _add_box(bm, (0.22, 0.22, 0.50), (0.31, 0.14, 1.22), mat_idx=5)
    _add_box(bm, (0.28, 0.28, 0.07), (0.31, 0.14, 1.48), mat_idx=2)

    # 5. Front Door Surround, Candy Awning & Welcome Step (facing -Y)
    # Door opening area: X in [-0.17, +0.17], Z in [0.11, 0.64]
    # Left & right frame jambs + lintel
    _add_box(bm, (0.055, 0.07, 0.54), (-0.195, -0.495, 0.38), mat_idx=2)
    _add_box(bm, (0.055, 0.07, 0.54), (0.195, -0.495, 0.38), mat_idx=2)
    _add_box(bm, (0.45, 0.08, 0.065), (0.0, -0.50, 0.665), mat_idx=2)
    # Little candy porch awning above front door
    _add_box(
        bm,
        (0.56, 0.26, 0.055),
        (0.0, -0.59, 0.72),
        mat_idx=1,
        rot_euler=(math.radians(18.0), 0.0, 0.0),
    )
    _add_box(
        bm,
        (0.58, 0.05, 0.065),
        (0.0, -0.71, 0.68),
        mat_idx=2,
    )
    # Biscuit welcome doorstep stone (Z = 0.0 .. 0.08)
    _add_box(bm, (0.50, 0.24, 0.08), (0.0, -0.62, 0.04), mat_idx=4)

    # 6. Cozy Round Gable Window above front door
    _add_cylinder(
        bm,
        segments=10,
        radius1=0.115,
        radius2=0.115,
        depth=0.05,
        center_xyz=(0.0, -0.495, 0.99),
        mat_idx=2,
        rot_euler=(math.radians(90.0), 0.0, 0.0),
        smooth=False,
    )
    _add_cylinder(
        bm,
        segments=10,
        radius1=0.082,
        radius2=0.082,
        depth=0.06,
        center_xyz=(0.0, -0.498, 0.99),
        mat_idx=6,
        rot_euler=(math.radians(90.0), 0.0, 0.0),
        smooth=False,
    )

    # 7. Left & Right side cottage windows with candy flower boxes
    _add_arched_window(
        bm,
        center=Vector((-wx, 0.0, 0.46)),
        rot_z=math.radians(-90.0),
        mat_glass=6,
        mat_frame=3,
        mat_box=2,
        mat_flower=7,
        add_flower_box=True,
    )
    _add_arched_window(
        bm,
        center=Vector((wx, 0.0, 0.46)),
        rot_z=math.radians(90.0),
        mat_glass=6,
        mat_frame=3,
        mat_box=2,
        mat_flower=7,
        add_flower_box=True,
    )
    # Back window (no flower box to keep polycount crisp)
    _add_arched_window(
        bm,
        center=Vector((0.0, wy, 0.46)),
        rot_z=math.radians(180.0),
        mat_glass=6,
        mat_frame=3,
        mat_box=2,
        mat_flower=7,
        add_flower_box=False,
    )

    house_obj = _create_multimat_mesh_object("starter_house", bm, collection, house_mats)
    house_obj.location = (0.0, 0.0, 0.0)
    house_obj.rotation_euler = (0.0, 0.0, 0.0)
    house_obj.scale = (1.0, 1.0, 1.0)

    # 8. Distinct FrontDoor child mesh (pivoted at left hinge so it can swing or knock!)
    #    Hinge at (-0.17, -0.505, 0.11); door spans X in [0.0 .. 0.34], Z in [0.0 .. 0.53]
    bm_door = bmesh.new()
    # Material slots: 0: door wood, 1: frosting trim, 2: window glow, 3: brass gold
    _add_box(bm_door, (0.34, 0.048, 0.53), (0.17, 0.0, 0.265), mat_idx=0)
    # Upper & lower decorative recessed/raised trim panels
    _add_box(bm_door, (0.24, 0.022, 0.17), (0.17, -0.026, 0.145), mat_idx=1)
    # Cute little round door peep-window
    _add_cylinder(
        bm_door,
        segments=8,
        radius1=0.068,
        radius2=0.068,
        depth=0.032,
        center_xyz=(0.17, -0.022, 0.37),
        mat_idx=1,
        rot_euler=(math.radians(90.0), 0.0, 0.0),
        smooth=False,
    )
    _add_cylinder(
        bm_door,
        segments=8,
        radius1=0.048,
        radius2=0.048,
        depth=0.038,
        center_xyz=(0.17, -0.024, 0.37),
        mat_idx=2,
        rot_euler=(math.radians(90.0), 0.0, 0.0),
        smooth=False,
    )
    # Glossy brass candy doorknob on right side of door
    _add_uvsphere(
        bm_door,
        u_segments=8,
        v_segments=6,
        radius=0.030,
        center_xyz=(0.285, -0.042, 0.245),
        scale_xyz=(1.0, 0.85, 1.0),
        mat_idx=3,
        smooth=True,
    )

    door_obj = _create_multimat_mesh_object(
        "FrontDoor", bm_door, collection, [mat_door, mat_frosting, mat_window, mat_gold]
    )
    door_obj.parent = house_obj
    door_obj.location = (-0.17, -0.505, 0.11)

    # 9. DoorstepSocket Empty right in front of FrontDoor for Dr. Bubblegum (PR-10)
    doorstep_socket = bpy.data.objects.new("DoorstepSocket", None)
    doorstep_socket.empty_display_type = "PLAIN_AXES"
    doorstep_socket.empty_display_size = 0.18
    doorstep_socket.parent = house_obj
    doorstep_socket.location = (0.0, -0.92, 0.0)
    collection.objects.link(doorstep_socket)

    return [house_obj, door_obj, doorstep_socket]


# ---------------------------------------------------------------------------
# 3. Glossy Candy Apple (apple.glb)
# ---------------------------------------------------------------------------

def build_apple(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build a plump glossy candy apple with curved stem and perky mint leaf (<= 400 tris)."""
    mat_red = common.get_or_create_material("apple_red")
    mat_stem = common.get_or_create_material("wood_wafer")
    mat_leaf = common.get_or_create_material("apple_leaf")

    bm = bmesh.new()

    # 1. Plump dimpled apple body (16x10 UV sphere -> 288 tris)
    ret = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    for v in ret["verts"]:
        x, y, z = v.co.x, v.co.y, v.co.z
        r_xy = math.hypot(x, y)
        # Wider upper shoulders, gently tapered base
        shoulder = 1.0 + 0.10 * z - 0.06 * (z * z)
        # Subtle organic 5-lobe apple fullness
        ang = math.atan2(y, x)
        lobe = 1.0 + 0.025 * math.cos(5.0 * ang)
        # Classic top & bottom dimples near the polar axis
        dimple = 0.0
        if z > 0.35:
            dimple = -0.34 * math.exp(-((r_xy / 0.42) ** 2))
        elif z < -0.45:
            dimple = 0.18 * math.exp(-((r_xy / 0.45) ** 2))

        v.co.x = x * 0.138 * shoulder * lobe
        v.co.y = y * 0.138 * shoulder * lobe
        v.co.z = (z + dimple) * 0.125

    for v in ret["verts"]:
        for f in v.link_faces:
            f.material_index = 0
            f.smooth = True

    min_z = min(v.co.z for v in bm.verts)
    for v in bm.verts:
        v.co.z -= min_z

    top_dimple_z = 0.21

    # 2. Curved wafer-brown stem (3 segments, 5-sided smooth tube -> ~36 tris)
    stem_pts = [
        Vector((0.0, 0.0, top_dimple_z - 0.015)),
        Vector((0.008, 0.0, top_dimple_z + 0.032)),
        Vector((0.024, -0.005, top_dimple_z + 0.070)),
    ]
    stem_rads = [0.013, 0.011, 0.015]
    _build_curved_tube(bm, stem_pts, stem_rads, tube_segs=5, mat_idx=1, smooth=True)

    # 3. Graceful curved almond mint-green candy leaf (2-segment curved blade -> 16 tris)
    l_base = Vector((0.010, -0.002, top_dimple_z + 0.030))
    leaf_local = [
        Vector((0.0, 0.0, 0.0)),           # 0: stem attachment
        Vector((0.034, -0.026, 0.026)),    # 1: near-front edge
        Vector((0.034, 0.026, 0.029)),     # 2: near-back edge
        Vector((0.072, -0.024, 0.036)),    # 3: far-front edge
        Vector((0.072, 0.024, 0.040)),     # 4: far-back edge
        Vector((0.108, -0.004, 0.026)),    # 5: gracefully drooping leaf tip
        Vector((0.048, -0.002, 0.040)),    # 6: upper mid-spine
        Vector((0.048, -0.002, 0.020)),    # 7: lower mid-spine
    ]
    rot_leaf = Matrix.Rotation(math.radians(-16.0), 4, "Z")
    lv = [bm.verts.new(l_base + (rot_leaf @ p)) for p in leaf_local]
    leaf_tris = [
        # Top surface
        (lv[0], lv[1], lv[6]),
        (lv[1], lv[3], lv[6]),
        (lv[3], lv[5], lv[6]),
        (lv[0], lv[6], lv[2]),
        (lv[6], lv[4], lv[2]),
        (lv[6], lv[5], lv[4]),
        # Bottom surface
        (lv[0], lv[7], lv[1]),
        (lv[1], lv[7], lv[3]),
        (lv[3], lv[7], lv[5]),
        (lv[0], lv[2], lv[7]),
        (lv[7], lv[2], lv[4]),
        (lv[7], lv[4], lv[5]),
    ]
    for tri in leaf_tris:
        f = bm.faces.new(tri)
        f.material_index = 2
        f.smooth = True

    apple_obj = _create_multimat_mesh_object("apple", bm, collection, [mat_red, mat_stem, mat_leaf])
    common.normalize_origin_to_base(apple_obj, center_xy=True, target_z=0.0)
    return [apple_obj]


# ---------------------------------------------------------------------------
# 4. Cozy Pastel Bed Prop (bed_prop.glb)
# ---------------------------------------------------------------------------

def build_bed_prop(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build a cozy pastel wooden pet bed with mattress, pillow & draped quilt (<= 400 tris)."""
    mat_wood = common.get_or_create_material("wood_wafer")
    mat_mattress = common.get_or_create_material("cream_frosting")
    mat_quilt = common.get_or_create_material("bed_quilt")
    mat_cuff = common.get_or_create_material("bed_quilt_cuff")
    mat_pillow = common.get_or_create_material("bed_pillow")

    # Material slots: 0: wood, 1: mattress, 2: quilt, 3: cuff, 4: pillow
    bm = bmesh.new()

    # 1. Four sturdy wooden corner posts (headboard posts taller at +Y, footboard shorter at -Y)
    post_specs = [
        (-0.34, 0.43, 0.44),   # headboard left
        (0.34, 0.43, 0.44),    # headboard right
        (-0.34, -0.43, 0.30),  # footboard left
        (0.34, -0.43, 0.30),   # footboard right
    ]
    for px, py, ph in post_specs:
        _add_box(bm, (0.075, 0.075, ph), (px, py, ph * 0.5), mat_idx=0)
        # Cute rounded finial knob atop each post (octagonal cushion)
        _add_cylinder(
            bm,
            segments=6,
            radius1=0.050,
            radius2=0.036,
            depth=0.055,
            center_xyz=(px, py, ph + 0.025),
            mat_idx=0,
            smooth=False,
        )

    # Headboard panel (+Y) & Footboard panel (-Y) + chunky side rails
    _add_box(bm, (0.64, 0.06, 0.36), (0.0, 0.43, 0.28), mat_idx=0)
    # Soft arched crown cap on headboard
    _add_box(bm, (0.44, 0.065, 0.065), (0.0, 0.43, 0.485), mat_idx=0)
    _add_box(bm, (0.64, 0.06, 0.21), (0.0, -0.43, 0.195), mat_idx=0)
    _add_box(bm, (0.055, 0.80, 0.12), (-0.34, 0.0, 0.155), mat_idx=0)
    _add_box(bm, (0.055, 0.80, 0.12), (0.34, 0.0, 0.155), mat_idx=0)

    # 2. Plump cream mattress sitting inside rails
    _add_box(bm, (0.63, 0.81, 0.12), (0.0, 0.0, 0.225), mat_idx=1)

    # 3. Cozy sky-blue quilt draped flush over front two-thirds of mattress + turned-back pink cuff
    _add_box(bm, (0.70, 0.54, 0.095), (0.0, -0.14, 0.275), mat_idx=2)
    # Folded pastel-pink top cuff
    _add_box(bm, (0.71, 0.11, 0.105), (0.0, 0.12, 0.292), mat_idx=3)

    # 4. Plump tilted butter-yellow pillow nestled against headboard (10x6 UV sphere -> 100 tris)
    ret_pillow = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0)
    pillow_xform = (
        Matrix.Translation((0.0, 0.28, 0.345))
        @ Euler((math.radians(-18.0), 0.0, 0.0), "XYZ").to_matrix().to_4x4()
        @ Matrix.Diagonal((0.265, 0.130, 0.092, 1.0))
    )
    for v in ret_pillow["verts"]:
        v.co = pillow_xform @ v.co
    for v in ret_pillow["verts"]:
        for f in v.link_faces:
            f.material_index = 4
            f.smooth = True

    bed_obj = _create_multimat_mesh_object(
        "bed_prop", bm, collection, [mat_wood, mat_mattress, mat_quilt, mat_cuff, mat_pillow]
    )
    common.normalize_origin_to_base(bed_obj, center_xy=True, target_z=0.0)
    return [bed_obj]


# ---------------------------------------------------------------------------
# Main Build Entrypoint
# ---------------------------------------------------------------------------

def main() -> dict[str, object]:
    common.ensure_dirs()
    common.reset_scene()

    larva_coll = common.ensure_collection("Larva")
    house_coll = common.ensure_collection("StarterHouse")
    apple_coll = common.ensure_collection("Apple")
    bed_coll = common.ensure_collection("BedProp")
    studio_coll = common.ensure_collection("Studio")

    larva_objs = build_jellybean_larva(larva_coll)
    house_objs = build_starter_house(house_coll)
    apple_objs = build_apple(apple_coll)
    bed_objs = build_bed_prop(bed_coll)

    # Studio lights & default preview camera framing Larva
    common.setup_world_lighting("#D7F3FF", strength=0.65)
    common.setup_studio_lights(studio_coll)

    cam_data = bpy.data.cameras.new("PreviewCamera")
    cam_data.lens = 50.0
    cam_obj = bpy.data.objects.new("PreviewCamera", cam_data)
    cam_obj.location = (0.85, -1.45, 0.80)
    studio_coll.objects.link(cam_obj)
    common.point_camera_at(cam_obj, Vector((0.0, 0.0, 0.28)))
    bpy.context.scene.camera = cam_obj

    # 1. Export all 4 GLBs (each strictly at origin (0,0,0), scale (1,1,1))
    larva_glb = common.export_glb(larva_objs, common.PUBLIC_MODELS_DIR / "jellybean_larva.glb")
    house_glb = common.export_glb(house_objs, common.PUBLIC_MODELS_DIR / "starter_house.glb")
    apple_glb = common.export_glb(apple_objs, common.PUBLIC_MODELS_DIR / "apple.glb")
    bed_glb = common.export_glb(bed_objs, common.PUBLIC_MODELS_DIR / "bed_prop.glb")

    # 2. Render 128x128 transparent studio PNG HUD icons
    larva_icon = common.render_icon_png(
        larva_objs,
        common.PUBLIC_ICONS_DIR / "larva.png",
        size=128,
        transparent=True,
        cam_azimuth_deg=18.0,
        cam_elevation_deg=14.0,
        ortho=True,
        margin=1.22,
        samples=32,
    )
    apple_icon = common.render_icon_png(
        apple_objs,
        common.PUBLIC_ICONS_DIR / "apple.png",
        size=128,
        transparent=True,
        cam_azimuth_deg=20.0,
        cam_elevation_deg=16.0,
        ortho=True,
        margin=1.22,
        samples=32,
    )
    bed_icon = common.render_icon_png(
        bed_objs,
        common.PUBLIC_ICONS_DIR / "bed.png",
        size=128,
        transparent=True,
        cam_azimuth_deg=34.0,
        cam_elevation_deg=26.0,
        ortho=True,
        margin=1.34,
        samples=32,
    )

    # 3. Render 512x512 verification thumbnails for visual silhouette review
    thumb_larva = common.render_icon_png(
        larva_objs,
        common.THUMBNAIL_DIR / "jellybean_larva_thumb.png",
        size=512,
        transparent=False,
        bg_hex="#D7F3FF",
        cam_azimuth_deg=22.0,
        cam_elevation_deg=14.0,
        ortho=False,
        margin=1.28,
        samples=24,
    )
    thumb_house = common.render_icon_png(
        house_objs,
        common.THUMBNAIL_DIR / "starter_house_thumb.png",
        size=512,
        transparent=False,
        bg_hex="#D7F3FF",
        cam_azimuth_deg=30.0,
        cam_elevation_deg=20.0,
        ortho=False,
        margin=1.45,
        samples=24,
    )
    thumb_apple = common.render_icon_png(
        apple_objs,
        common.THUMBNAIL_DIR / "apple_thumb.png",
        size=512,
        transparent=False,
        bg_hex="#D7F3FF",
        cam_azimuth_deg=22.0,
        cam_elevation_deg=16.0,
        ortho=False,
        margin=1.28,
        samples=24,
    )
    thumb_bed = common.render_icon_png(
        bed_objs,
        common.THUMBNAIL_DIR / "bed_prop_thumb.png",
        size=512,
        transparent=False,
        bg_hex="#D7F3FF",
        cam_azimuth_deg=36.0,
        cam_elevation_deg=26.0,
        ortho=False,
        margin=1.38,
        samples=24,
    )

    # Restore preview world lighting and keep Larva visible in viewport (others hidden in
    # viewport so default PreviewCamera shows Larva cleanly without overlapping at (0,0,0))
    common.setup_world_lighting("#D7F3FF", strength=0.65)
    for obj in (*house_objs, *apple_objs, *bed_objs):
        obj.hide_viewport = True
        obj.hide_render = True
    for obj in larva_objs:
        obj.hide_viewport = False
        obj.hide_render = False
    bpy.context.view_layer.objects.active = larva_objs[0]

    # 4. Save clean source .blend file
    blend_path = common.BLEND_DIR / "pet_core.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    # 5. Assert PR-04 triangle & file size budgets
    assert larva_glb["triangles"] <= 1200, f"Larva tris {larva_glb['triangles']} > 1200"
    assert larva_glb["size_bytes"] <= 45 * 1024, f"Larva size {larva_glb['size_bytes']} > 45 KB"
    assert house_glb["triangles"] <= 1500, f"House tris {house_glb['triangles']} > 1500"
    assert house_glb["size_bytes"] <= 65 * 1024, f"House size {house_glb['size_bytes']} > 65 KB"
    assert apple_glb["triangles"] <= 400, f"Apple tris {apple_glb['triangles']} > 400"
    assert apple_glb["size_bytes"] <= 20 * 1024, f"Apple size {apple_glb['size_bytes']} > 20 KB"
    assert bed_glb["triangles"] <= 400, f"Bed tris {bed_glb['triangles']} > 400"
    assert bed_glb["size_bytes"] <= 20 * 1024, f"Bed size {bed_glb['size_bytes']} > 20 KB"

    for root_obj in (larva_objs[0], house_objs[0], apple_objs[0], bed_objs[0]):
        assert tuple(round(c, 5) for c in root_obj.location) == (0.0, 0.0, 0.0), (
            f"{root_obj.name} origin not (0,0,0): {tuple(root_obj.location)}"
        )
        assert tuple(round(c, 5) for c in root_obj.scale) == (1.0, 1.0, 1.0), (
            f"{root_obj.name} scale not (1,1,1): {tuple(root_obj.scale)}"
        )

    return {
        "blend_path": str(blend_path),
        "models": {
            "jellybean_larva": larva_glb,
            "starter_house": house_glb,
            "apple": apple_glb,
            "bed_prop": bed_glb,
        },
        "icons": {
            "larva": larva_icon,
            "apple": apple_icon,
            "bed": bed_icon,
        },
        "thumbnails": {
            "larva": thumb_larva,
            "starter_house": thumb_house,
            "apple": thumb_apple,
            "bed_prop": thumb_bed,
        },
    }


if __name__ == "__main__":
    summary = main()
    print(summary)
