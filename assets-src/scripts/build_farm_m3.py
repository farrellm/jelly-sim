"""Build PR-11 Farm Crops, Apple Tree & Feather Blanket Asset Pack via Blender MCP.

Generates:
  - assets-src/blend/farm_m3.blend
  - public/assets/models/garden_plot.glb      (<= 400 tris,   <= 20 KB)
  - public/assets/models/crop_parsley.glb     (<= 400 tris,   <= 20 KB)
  - public/assets/models/crop_tomato.glb      (<= 400 tris,   <= 20 KB)
  - public/assets/models/crop_candycane.glb   (<= 400 tris,   <= 20 KB)
  - public/assets/models/crop_100beans.glb    (<= 400 tris,   <= 20 KB)
  - public/assets/models/apple_tree.glb       (<= 1,000 tris, <= 45 KB)
  - public/assets/models/feather.glb          (<= 400 tris,   <= 20 KB)
  - public/assets/models/knitted_blanket.glb  (<= 400 tris,   <= 20 KB)
  - public/assets/models/feather_loom.glb     (<= 1,500 tris, <= 65 KB)
  - public/assets/icons/*.png                 (9 matching 128x128 transparent RGBA studio icons)

Can be executed inside Blender MCP (`execute_blender_code` / `execute_blender_code_for_cli`)
or headless via:
    blender --background --python assets-src/scripts/build_farm_m3.py
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
# Shared Low-Poly Geometry Helpers
# ---------------------------------------------------------------------------

def _add_box(
    bm: bmesh.types.BMesh,
    size_xyz: tuple[float, float, float],
    center_xyz: tuple[float, float, float],
    mat_idx: int,
    rot_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
    smooth: bool = False,
) -> list[bmesh.types.BMFace]:
    """Append an axis-aligned or rotated box to `bm`."""
    xform = (
        Matrix.Translation(center_xyz)
        @ Euler(rot_euler, "XYZ").to_matrix().to_4x4()
        @ Matrix.Diagonal((size_xyz[0], size_xyz[1], size_xyz[2], 1.0))
    )
    ret = bmesh.ops.create_cube(bm, size=1.0, matrix=xform)
    faces = list({f for v in ret["verts"] for f in v.link_faces})
    for f in faces:
        f.material_index = mat_idx
        f.smooth = smooth
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


def _add_icosphere(
    bm: bmesh.types.BMesh,
    subdivisions: int,
    radius: float,
    center_xyz: tuple[float, float, float],
    scale_xyz: tuple[float, float, float],
    mat_idx: int,
    rot_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
    smooth: bool = True,
    ruffle: float = 0.0,
) -> list[bmesh.types.BMFace]:
    """Append a transformed icosphere with optional organic clay ruffle."""
    xform = (
        Matrix.Translation(center_xyz)
        @ Euler(rot_euler, "XYZ").to_matrix().to_4x4()
        @ Matrix.Diagonal((scale_xyz[0], scale_xyz[1], scale_xyz[2], 1.0))
    )
    ret = bmesh.ops.create_icosphere(
        bm,
        subdivisions=subdivisions,
        radius=radius,
    )
    for idx, v in enumerate(ret["verts"]):
        p = v.co.copy()
        if ruffle > 0.0:
            wave = 1.0 + ruffle * math.sin(idx * 2.35 + p.x * 7.0 + p.y * 5.0)
            p *= wave
        v.co = xform @ p
    faces = list({f for v in ret["verts"] for f in v.link_faces})
    for f in faces:
        f.material_index = mat_idx
        f.smooth = smooth
    return faces


def _add_leaf_diamond(
    bm: bmesh.types.BMesh,
    origin: Vector,
    length: float,
    width: float,
    thickness: float,
    rot_euler: tuple[float, float, float],
    mat_idx: int,
    smooth: bool = True,
) -> list[bmesh.types.BMFace]:
    """Build a crisp 8-triangle plump leaf blade extending along local +X from `origin`."""
    rot_m = Matrix.Translation(origin) @ Euler(rot_euler, "XYZ").to_matrix().to_4x4()
    local_pts = [
        Vector((0.0, 0.0, 0.0)),                                  # 0: base
        Vector((length * 0.48, -width * 0.5, thickness * 0.15)),  # 1: left mid
        Vector((length * 0.48, width * 0.5, thickness * 0.15)),   # 2: right mid
        Vector((length, 0.0, -thickness * 0.25)),                 # 3: gently drooping tip
        Vector((length * 0.46, 0.0, thickness * 0.65)),           # 4: top ridge
        Vector((length * 0.46, 0.0, -thickness * 0.45)),          # 5: bottom keel
    ]
    verts = [bm.verts.new(rot_m @ p) for p in local_pts]
    tris = [
        # Top
        (verts[0], verts[1], verts[4]),
        (verts[1], verts[3], verts[4]),
        (verts[0], verts[4], verts[2]),
        (verts[4], verts[3], verts[2]),
        # Bottom
        (verts[0], verts[5], verts[1]),
        (verts[1], verts[5], verts[3]),
        (verts[0], verts[2], verts[5]),
        (verts[5], verts[2], verts[3]),
    ]
    faces: list[bmesh.types.BMFace] = []
    for tri in tris:
        f = bm.faces.new(tri)
        f.material_index = mat_idx
        f.smooth = smooth
        faces.append(f)
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
    prev_norm: Vector | None = None

    for i, pt in enumerate(points):
        if i == 0:
            tangent = (points[1] - points[0]).normalized()
        elif i == n_pts - 1:
            tangent = (points[-1] - points[-2]).normalized()
        else:
            tangent = (points[i + 1] - points[i - 1]).normalized()

        if prev_norm is None:
            ref = Vector((0.0, 1.0, 0.0))
            if abs(tangent.dot(ref)) > 0.90:
                ref = Vector((1.0, 0.0, 0.0))
            binorm = tangent.cross(ref).normalized()
            norm = binorm.cross(tangent).normalized()
        else:
            norm = prev_norm - tangent * prev_norm.dot(tangent)
            if norm.length < 1e-5:
                norm = Vector((1.0, 0.0, 0.0))
            norm.normalize()
            binorm = tangent.cross(norm).normalized()
        prev_norm = norm

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
# 1. Raised Wooden Garden Plot (garden_plot.glb)
# ---------------------------------------------------------------------------

def build_garden_plot(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build a cozy raised pastel wooden garden plot with tilled soil furrows (<= 400 tris).

    Fits cleanly on a Ring 0 plot pad (r=0.86m), front facing -Y (Three.js +Z).
    Includes a `CropSocket` Empty seated on top of the soil center (Z = 0.145m).
    """
    mat_wood = common.get_or_create_material("wood_wafer")
    mat_post = common.get_or_create_material("cliff_biscuit")
    mat_cream = common.get_or_create_material("cream_frosting")
    mat_soil = common.get_or_create_material("soil_loam")
    mat_furrow = common.get_or_create_material("soil_furrow")
    mat_leaf = common.get_or_create_material("parsley_bright")

    bm = bmesh.new()

    # 1. Four sturdy raised wooden planter side walls (Z = 0.0 .. 0.175)
    _add_box(bm, (1.06, 0.08, 0.175), (0.0, -0.50, 0.0875), mat_idx=0)
    _add_box(bm, (1.06, 0.08, 0.175), (0.0, 0.50, 0.0875), mat_idx=0)
    _add_box(bm, (0.08, 1.00, 0.175), (-0.50, 0.0, 0.0875), mat_idx=0)
    _add_box(bm, (0.08, 1.00, 0.175), (0.50, 0.0, 0.0875), mat_idx=0)

    # 2. Four chunky corner picket posts with cute cream-frosting finial caps
    for sx in (-0.50, 0.50):
        for sy in (-0.50, 0.50):
            _add_box(bm, (0.115, 0.115, 0.235), (sx, sy, 0.1175), mat_idx=1)
            _add_box(bm, (0.138, 0.138, 0.042), (sx, sy, 0.248), mat_idx=2)

    # 3. Rich chocolate-loam soil interior bed (Z = 0.01 .. 0.140)
    _add_box(bm, (0.94, 0.94, 0.130), (0.0, 0.0, 0.075), mat_idx=3)

    # 4. Three neat rounded tilled soil furrow ridges along X
    for fy in (-0.28, 0.0, 0.28):
        ret = bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            cap_tris=False,
            segments=6,
            radius1=0.088,
            radius2=0.088,
            depth=0.86,
            matrix=(
                Matrix.Translation((0.0, fy, 0.132))
                @ Matrix.Diagonal((1.0, 1.15, 0.44, 1.0))
                @ Euler((0.0, math.radians(90.0), 0.0), "XYZ").to_matrix().to_4x4()
            ),
        )
        for v in ret["verts"]:
            for f in v.link_faces:
                f.material_index = 4
                f.smooth = True

    # 5. Adorable wooden garden marker stake on front-right edge
    _add_box(bm, (0.042, 0.035, 0.25), (0.33, -0.57, 0.125), mat_idx=1)
    _add_box(
        bm,
        (0.19, 0.032, 0.115),
        (0.33, -0.59, 0.245),
        mat_idx=2,
        rot_euler=(math.radians(-16.0), 0.0, math.radians(-8.0)),
    )
    _add_leaf_diamond(
        bm,
        Vector((0.28, -0.615, 0.245)),
        length=0.095,
        width=0.055,
        thickness=0.022,
        rot_euler=(0.0, math.radians(-18.0), math.radians(-8.0)),
        mat_idx=5,
        smooth=True,
    )

    plot_obj = _create_multimat_mesh_object(
        "garden_plot",
        bm,
        collection,
        [mat_wood, mat_post, mat_cream, mat_soil, mat_furrow, mat_leaf],
    )
    common.normalize_origin_to_base(plot_obj, center_xy=False, target_z=0.0)

    crop_socket = bpy.data.objects.new("CropSocket", None)
    crop_socket.empty_display_type = "PLAIN_AXES"
    crop_socket.empty_display_size = 0.18
    crop_socket.parent = plot_obj
    crop_socket.location = (0.0, 0.0, 0.145)
    collection.objects.link(crop_socket)

    return [plot_obj, crop_socket]


# ---------------------------------------------------------------------------
# 2. Curly Parsley Crop (crop_parsley.glb)
# ---------------------------------------------------------------------------

def build_crop_parsley(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build a lush curly Parsley herb rosette (<= 400 tris, <= 20 KB, single mesh)."""
    mat_dark = common.get_or_create_material("parsley_dark")
    mat_bright = common.get_or_create_material("parsley_bright")
    mat_vine = common.get_or_create_material("vine_green")

    bm = bmesh.new()

    # Smooth-shaded central herb rosette base
    _add_icosphere(
        bm,
        subdivisions=1,
        radius=0.105,
        center_xyz=(0.0, 0.0, 0.065),
        scale_xyz=(1.18, 1.18, 0.62),
        mat_idx=2,
        smooth=True,
        ruffle=0.08,
    )

    # Outer ring of 6 graceful parsley stalks, each crowned with a 3-leaflet fan + curly tuft!
    for i in range(6):
        ang = math.radians(i * 60.0 + 18.0)
        ca, sa = math.cos(ang), math.sin(ang)
        stem_len = 0.25 + (i % 2) * 0.04
        tilt = math.radians(36.0 + (i % 2) * 5.0)
        tip_r = math.sin(tilt) * stem_len
        tip_z = 0.04 + math.cos(tilt) * stem_len
        mid_r = tip_r * 0.5
        mid_z = 0.04 + math.cos(tilt) * stem_len * 0.5

        _add_cylinder(
            bm,
            segments=4,
            radius1=0.019,
            radius2=0.011,
            depth=stem_len,
            center_xyz=(ca * mid_r, sa * mid_r, mid_z),
            mat_idx=2,
            rot_euler=(sa * tilt, -ca * tilt, ang),
            smooth=True,
        )

        # Classic trilobed parsley leaf fan seated solidly on each stalk tip!
        mat_frond = 0 if i % 2 == 0 else 1
        tip_v = Vector((ca * (tip_r * 0.88), sa * (tip_r * 0.88), tip_z - 0.015))
        for fan_deg, llen, lwid in ((-40.0, 0.145, 0.095), (0.0, 0.175, 0.110), (40.0, 0.145, 0.095)):
            _add_leaf_diamond(
                bm,
                tip_v,
                length=llen,
                width=lwid,
                thickness=0.042,
                rot_euler=(0.0, math.radians(-16.0), ang + math.radians(fan_deg)),
                mat_idx=mat_frond,
                smooth=True,
            )

    # Inner crown of 3 tall perky parsley sprigs with soft smooth curly puffs + top leaves
    for j in range(3):
        ang = math.radians(j * 120.0 - 15.0)
        ca, sa = math.cos(ang), math.sin(ang)
        _add_cylinder(
            bm,
            segments=4,
            radius1=0.018,
            radius2=0.011,
            depth=0.31,
            center_xyz=(ca * 0.042, sa * 0.042, 0.195),
            mat_idx=2,
            rot_euler=(sa * 0.22, -ca * 0.22, ang),
            smooth=True,
        )
        _add_icosphere(
            bm,
            subdivisions=1,
            radius=0.088,
            center_xyz=(ca * 0.085, sa * 0.085, 0.355),
            scale_xyz=(1.15, 1.05, 0.72),
            mat_idx=1 if j != 1 else 0,
            rot_euler=(0.15, -0.12, ang),
            smooth=True,
            ruffle=0.14,
        )
        _add_leaf_diamond(
            bm,
            Vector((ca * 0.07, sa * 0.07, 0.37)),
            length=0.15,
            width=0.096,
            thickness=0.036,
            rot_euler=(0.0, math.radians(-26.0), ang),
            mat_idx=0 if j != 1 else 1,
            smooth=True,
        )

    parsley_obj = _create_multimat_mesh_object(
        "crop_parsley", bm, collection, [mat_dark, mat_bright, mat_vine]
    )
    common.normalize_origin_to_base(parsley_obj, center_xy=True, target_z=0.0)
    return [parsley_obj]


# ---------------------------------------------------------------------------
# 3. Vine-Ripened Tomato Crop (crop_tomato.glb)
# ---------------------------------------------------------------------------

def build_crop_tomato(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build a wooden-staked bushy Tomato plant with 4 glossy red ripe tomatoes (<= 400 tris)."""
    mat_vine = common.get_or_create_material("vine_green")
    mat_leaf = common.get_or_create_material("parsley_bright")
    mat_tomato = common.get_or_create_material("tomato_glossy")
    mat_wood = common.get_or_create_material("wood_wafer")

    bm = bmesh.new()

    # 1. Miniature wooden tomato trellis stake + crossbar
    _add_box(bm, (0.042, 0.042, 0.62), (-0.03, 0.05, 0.31), mat_idx=3)
    _add_box(bm, (0.36, 0.032, 0.034), (0.0, 0.05, 0.44), mat_idx=3)

    # 2. Central green stalk + 4 plush smooth-shaded leafy bush puffs
    _add_cylinder(
        bm,
        segments=5,
        radius1=0.032,
        radius2=0.020,
        depth=0.46,
        center_xyz=(0.0, 0.0, 0.23),
        mat_idx=0,
        smooth=True,
    )
    puff_specs = [
        ((0.0, 0.0, 0.49), (1.15, 1.10, 0.85), 0.145, 1),
        ((-0.12, -0.05, 0.30), (1.10, 1.05, 0.90), 0.140, 0),
        ((0.12, 0.03, 0.32), (1.12, 1.05, 0.90), 0.140, 0),
        ((0.02, -0.04, 0.18), (1.20, 1.15, 0.82), 0.135, 1),
    ]
    for pos, scl, rad, mi in puff_specs:
        _add_icosphere(
            bm,
            subdivisions=1,
            radius=rad,
            center_xyz=pos,
            scale_xyz=scl,
            mat_idx=mi,
            smooth=True,
            ruffle=0.10,
        )

    # 4 splayed fresh vine leaves framing the bush
    for idx, (lx, ly, lz, yaw) in enumerate([
        (-0.14, -0.11, 0.22, -130.0),
        (0.15, -0.10, 0.26, -45.0),
        (0.14, 0.11, 0.42, 35.0),
        (-0.13, 0.10, 0.44, 145.0),
    ]):
        _add_leaf_diamond(
            bm,
            Vector((lx, ly, lz)),
            length=0.14,
            width=0.085,
            thickness=0.028,
            rot_euler=(0.0, math.radians(-10.0), math.radians(yaw)),
            mat_idx=1 if idx % 2 == 0 else 0,
            smooth=True,
        )

    # 3. Four plump glossy cherry-red ripe tomatoes visibly hanging around the plant!
    tomato_specs = [
        ((-0.15, -0.15, 0.24), 0.088),   # front-left hero tomato
        ((0.16, -0.12, 0.36), 0.082),    # front-right upper tomato
        ((0.02, -0.17, 0.48), 0.075),    # top-front jewel tomato
        ((0.14, 0.14, 0.22), 0.080),     # back-right tomato for 360° orbit readability
    ]
    for (tx, ty, tz), trad in tomato_specs:
        _add_uvsphere(
            bm,
            u_segments=8,
            v_segments=4,
            radius=trad,
            center_xyz=(tx, ty, tz),
            scale_xyz=(1.08, 1.08, 0.92),
            mat_idx=2,
            smooth=True,
        )
        # Cute little bright-green calyx cap atop each tomato (4-sided star cone -> 12 tris)
        _add_cylinder(
            bm,
            segments=4,
            radius1=trad * 0.50,
            radius2=0.010,
            depth=0.032,
            center_xyz=(tx, ty, tz + trad * 0.86),
            mat_idx=1,
            smooth=True,
        )

    tomato_obj = _create_multimat_mesh_object(
        "crop_tomato", bm, collection, [mat_vine, mat_leaf, mat_tomato, mat_wood]
    )
    common.normalize_origin_to_base(tomato_obj, center_xy=True, target_z=0.0)
    return [tomato_obj]


# ---------------------------------------------------------------------------
# 4. Glossy Peppermint Candy Cane Crop (crop_candycane.glb)
# ---------------------------------------------------------------------------

def build_crop_candycane(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build a glossy helical-striped peppermint Candy Cane crop (<= 400 tris, <= 20 KB)."""
    mat_white = common.get_or_create_material("candycane_white")
    mat_red = common.get_or_create_material("candycane_red")
    mat_leaf = common.get_or_create_material("parsley_bright")
    mat_leaf_dark = common.get_or_create_material("parsley_dark")

    bm = bmesh.new()

    # 1. Classic J-hook candy cane spine (16 rings x 8 segs with continuous helical twist!)
    spine_pts: list[Vector] = []
    for step in range(8):
        t = step / 7.0
        spine_pts.append(Vector((-0.055, 0.0, t * 0.45)))

    hook_cx = 0.065
    hook_cz = 0.45
    hook_r = 0.120
    hook_steps = 8
    for s in range(1, hook_steps + 1):
        ang = math.pi - (math.radians(188.0) * s / hook_steps)
        hx = hook_cx + hook_r * math.cos(ang)
        hz = hook_cz + hook_r * math.sin(ang)
        spine_pts.append(Vector((hx, 0.0, hz)))

    tube_segs = 8
    cane_r = 0.056
    rings: list[list[bmesh.types.BMVert]] = []
    n_pts = len(spine_pts)

    # Compute cumulative arc length so the barber-pole stripe twist rate is perfectly uniform!
    arc_lens = [0.0]
    for i in range(1, n_pts):
        arc_lens.append(arc_lens[-1] + (spine_pts[i] - spine_pts[i - 1]).length)

    twist_rad_per_meter = 10.5  # ~1.7 full smooth helical turns along the whole candy cane

    for i, pt in enumerate(spine_pts):
        if i == 0:
            tangent = (spine_pts[1] - spine_pts[0]).normalized()
        elif i == n_pts - 1:
            tangent = (spine_pts[-1] - spine_pts[-2]).normalized()
        else:
            tangent = (spine_pts[i + 1] - spine_pts[i - 1]).normalized()

        binorm = Vector((0.0, 1.0, 0.0))
        norm = binorm.cross(tangent).normalized()

        r = cane_r * (0.92 if i == n_pts - 1 else 1.0)
        twist = arc_lens[i] * twist_rad_per_meter
        ring: list[bmesh.types.BMVert] = []
        for k in range(tube_segs):
            ang = (2.0 * math.pi * k) / tube_segs + twist
            offset = r * (math.cos(ang) * norm + math.sin(ang) * binorm)
            ring.append(bm.verts.new(pt + offset))
        rings.append(ring)

    # Constant material per longitudinal twisted strip -> ZERO stair-stepping, silky spiral ribbons!
    for i in range(n_pts - 1):
        ra = rings[i]
        rb = rings[i + 1]
        for k in range(tube_segs):
            kn = (k + 1) % tube_segs
            f = bm.faces.new((ra[k], rb[k], rb[kn], ra[kn]))
            f.material_index = 1 if (k % 4) < 2 else 0
            f.smooth = True

    f_bot = bm.faces.new(list(reversed(rings[0])))
    f_bot.material_index = 0
    f_bot.smooth = False

    tip_center = spine_pts[-1] + (spine_pts[-1] - spine_pts[-2]).normalized() * (cane_r * 0.52)
    v_tip = bm.verts.new(tip_center)
    for k in range(tube_segs):
        kn = (k + 1) % tube_segs
        ft = bm.faces.new((rings[-1][k], rings[-1][kn], v_tip))
        ft.material_index = 1 if (k % 4) < 2 else 0
        ft.smooth = True

    # 2. Cute peppermint-leaf sprout collar hugging the base of the cane (4 leaves -> 32 tris)
    leaf_specs = [
        (math.radians(-30.0), 0.18, 0.095, 2),
        (math.radians(35.0), 0.16, 0.088, 3),
        (math.radians(150.0), 0.17, 0.092, 2),
        (math.radians(-145.0), 0.16, 0.085, 3),
    ]
    for yaw, llen, lwid, mi in leaf_specs:
        _add_leaf_diamond(
            bm,
            Vector((-0.055, 0.0, 0.045)),
            length=llen,
            width=lwid,
            thickness=0.028,
            rot_euler=(0.0, math.radians(-22.0), yaw),
            mat_idx=mi,
            smooth=True,
        )

    cane_obj = _create_multimat_mesh_object(
        "crop_candycane", bm, collection, [mat_white, mat_red, mat_leaf, mat_leaf_dark]
    )
    common.normalize_origin_to_base(cane_obj, center_xy=True, target_z=0.0)
    return [cane_obj]


# ---------------------------------------------------------------------------
# 5. "100 Jelly Beans" Overflowing Rainbow Crop (crop_100beans.glb)
# ---------------------------------------------------------------------------

def _add_mini_jellybean(
    bm: bmesh.types.BMesh,
    center: tuple[float, float, float],
    scale: float,
    rot_euler: tuple[float, float, float],
    mat_idx: int,
) -> None:
    """Append a glossy curved 36-triangle mini jelly bean (6x4 UV sphere)."""
    xform = Matrix.Translation(center) @ Euler(rot_euler, "XYZ").to_matrix().to_4x4()
    ret = bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=1.0)
    for v in ret["verts"]:
        x, y, z = v.co.x, v.co.y, v.co.z
        curve_x = -0.22 * (z * z) + 0.08
        local_p = Vector(((x * 0.62 + curve_x) * scale, y * 0.56 * scale, z * 0.96 * scale))
        v.co = xform @ local_p
    for v in ret["verts"]:
        for f in v.link_faces:
            f.material_index = mat_idx
            f.smooth = True


def build_crop_100beans(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build the iconic '100 Jelly Beans' bursting rainbow crop bush (<= 400 tris, <= 20 KB)."""
    mat_vine = common.get_or_create_material("vine_green")
    mat_leaf = common.get_or_create_material("parsley_bright")
    bean_mats = [
        common.get_or_create_material("jelly_cherry"),     # 2
        common.get_or_create_material("jelly_gold"),       # 3
        common.get_or_create_material("jelly_berry"),      # 4
        common.get_or_create_material("jelly_bubblegum"),  # 5
        common.get_or_create_material("jelly_lime"),       # 6
        common.get_or_create_material("jelly_lavender"),   # 7
    ]

    bm = bmesh.new()

    # 1. Soft plush smooth-shaded leafy cradle nest (3 puffs = 60 tris + 4 fanned leaves = 32 tris)
    nest_puffs = [
        ((0.0, 0.0, 0.105), (1.32, 1.32, 0.58), 0.185, 0),
        ((-0.11, -0.05, 0.145), (1.08, 1.05, 0.68), 0.128, 1),
        ((0.11, 0.05, 0.145), (1.08, 1.05, 0.68), 0.128, 1),
    ]
    for pos, scl, rad, mi in nest_puffs:
        _add_icosphere(
            bm,
            subdivisions=1,
            radius=rad,
            center_xyz=pos,
            scale_xyz=scl,
            mat_idx=mi,
            smooth=True,
            ruffle=0.08,
        )

    for k in range(4):
        yaw = math.radians(k * 90.0 + 45.0)
        _add_leaf_diamond(
            bm,
            Vector((math.cos(yaw) * 0.12, math.sin(yaw) * 0.12, 0.085)),
            length=0.175,
            width=0.110,
            thickness=0.032,
            rot_euler=(0.0, math.radians(-14.0), yaw),
            mat_idx=1 if k % 2 == 0 else 0,
            smooth=True,
        )

    # 2. Eight joyful rainbow mini jelly beans packed snugly into a festive bursting pile (288 tris)!
    bean_specs = [
        ((0.00, -0.01, 0.34), 0.104, (12.0, -14.0, 10.0), 2),     # cherry crown bean (snug!)
        ((-0.12, -0.09, 0.25), 0.096, (-18.0, -30.0, 25.0), 3),   # gold front-left
        ((0.12, -0.10, 0.24), 0.096, (20.0, 26.0, -20.0), 4),     # berry front-right
        ((0.00, -0.15, 0.17), 0.094, (44.0, 8.0, -12.0), 5),      # bubblegum front center
        ((-0.14, 0.07, 0.23), 0.094, (-15.0, -38.0, 110.0), 6),   # lime mid-left
        ((0.14, 0.08, 0.24), 0.094, (22.0, 36.0, -105.0), 7),     # lavender mid-right
        ((0.00, 0.12, 0.27), 0.096, (-34.0, 10.0, 175.0), 2),     # cherry back crown
        ((-0.02, 0.03, 0.22), 0.090, (8.0, 58.0, 45.0), 3),       # gold nested core
    ]
    for center, scl, rot_deg, mi in bean_specs:
        _add_mini_jellybean(
            bm,
            center=center,
            scale=scl,
            rot_euler=tuple(math.radians(a) for a in rot_deg),
            mat_idx=mi,
        )

    beans_obj = _create_multimat_mesh_object(
        "crop_100beans", bm, collection, [mat_vine, mat_leaf, *bean_mats]
    )
    common.normalize_origin_to_base(beans_obj, center_xy=True, target_z=0.0)
    return [beans_obj]


# ---------------------------------------------------------------------------
# 6. Perennial Apple Tree (apple_tree.glb)
# ---------------------------------------------------------------------------

def build_apple_tree(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build a chunky toyetic perennial Apple Tree with distinct `CanopyApples` child (<= 1,000 tris)."""
    mat_bark = common.get_or_create_material("bark_warm")
    mat_canopy_rich = common.get_or_create_material("canopy_rich")
    mat_canopy_light = common.get_or_create_material("canopy_light")
    mat_apple = common.get_or_create_material("apple_red")
    mat_leaf = common.get_or_create_material("apple_leaf")

    bm_tree = bmesh.new()

    # Gently curved chunky trunk seated squarely on Z = 0.0
    trunk_pts = [
        Vector((0.0, 0.0, 0.0)),
        Vector((-0.02, 0.01, 0.24)),
        Vector((-0.01, 0.02, 0.50)),
        Vector((0.03, 0.0, 0.74)),
        Vector((0.02, -0.01, 0.94)),
    ]
    trunk_rads = [0.245, 0.168, 0.145, 0.135, 0.115]
    _build_curved_tube(bm_tree, trunk_pts, trunk_rads, tube_segs=7, mat_idx=0, smooth=True)

    # Four cozy flared cartoon roots clamped cleanly flush to Z = 0.0!
    for k in range(4):
        ang = math.radians(k * 90.0 + 38.0)
        ca, sa = math.cos(ang), math.sin(ang)
        root_faces = _add_cylinder(
            bm_tree,
            segments=5,
            radius1=0.095,
            radius2=0.048,
            depth=0.28,
            center_xyz=(ca * 0.19, sa * 0.19, 0.075),
            mat_idx=0,
            rot_euler=(sa * math.radians(66.0), -ca * math.radians(66.0), ang),
            smooth=True,
        )
        for f in root_faces:
            for v in f.verts:
                if v.co.z < 0.0:
                    v.co.z = 0.0

    # Two sturdy stubby upper limbs branching into the canopy
    _add_cylinder(
        bm_tree,
        segments=5,
        radius1=0.082,
        radius2=0.056,
        depth=0.34,
        center_xyz=(-0.15, -0.03, 0.86),
        mat_idx=0,
        rot_euler=(0.0, math.radians(-42.0), 0.0),
        smooth=True,
    )
    _add_cylinder(
        bm_tree,
        segments=5,
        radius1=0.076,
        radius2=0.052,
        depth=0.32,
        center_xyz=(0.16, 0.04, 0.88),
        mat_idx=0,
        rot_euler=(0.0, math.radians(40.0), 0.0),
        smooth=True,
    )

    # Six plump overlapping cloud-puff foliage clusters (u=10, v=6 -> 100 tris each = 600 tris?
    # Keep 5 lush puffs at u=10, v=6 = 500 tris + 1 crown puff u=10, v=5 = 80 tris -> 580 tris!)
    canopy_puffs = [
        ((0.00, 0.00, 1.30), (1.16, 1.12, 0.96), 0.39, 2, 6),    # sunlit top crown
        ((-0.34, -0.10, 1.06), (1.06, 1.02, 0.92), 0.34, 1, 6),  # left puff
        ((0.35, -0.06, 1.09), (1.06, 1.04, 0.92), 0.34, 1, 6),   # right puff
        ((0.02, -0.32, 1.04), (1.10, 0.95, 0.90), 0.33, 2, 6),   # front puff
        ((-0.06, 0.32, 1.07), (1.10, 0.98, 0.90), 0.34, 1, 5),   # back puff
    ]
    for pos, scl, rad, mi, v_segs in canopy_puffs:
        _add_uvsphere(
            bm_tree,
            u_segments=10,
            v_segments=v_segs,
            radius=rad,
            center_xyz=pos,
            scale_xyz=scl,
            mat_idx=mi,
            smooth=True,
        )

    min_z_tree = min(v.co.z for v in bm_tree.verts)
    if abs(min_z_tree) > 1e-5:
        for v in bm_tree.verts:
            v.co.z -= min_z_tree

    tree_obj = _create_multimat_mesh_object(
        "apple_tree", bm_tree, collection, [mat_bark, mat_canopy_rich, mat_canopy_light]
    )
    tree_obj.location = (0.0, 0.0, 0.0)
    tree_obj.rotation_euler = (0.0, 0.0, 0.0)
    tree_obj.scale = (1.0, 1.0, 1.0)

    # Distinct `CanopyApples` Child Mesh (5 bright glossy apples nested on exterior)
    bm_apples = bmesh.new()
    apple_positions = [
        (-0.34, -0.38, 1.03, -25.0),   # front-left hero apple
        (0.28, -0.44, 1.12, 20.0),     # front-right hero apple
        (-0.04, -0.46, 1.34, 0.0),     # upper-front crown apple
        (0.56, 0.08, 1.08, 85.0),      # right-side apple
        (-0.38, 0.34, 1.14, 145.0),    # back-left apple
    ]
    for ax, ay, az, yaw_deg in apple_positions:
        _add_uvsphere(
            bm_apples,
            u_segments=8,
            v_segments=4,
            radius=0.105,
            center_xyz=(ax, ay, az - min_z_tree),
            scale_xyz=(1.04, 1.04, 0.94),
            mat_idx=0,
            smooth=True,
        )
        _add_leaf_diamond(
            bm_apples,
            Vector((ax, ay, az - min_z_tree + 0.095)),
            length=0.095,
            width=0.055,
            thickness=0.020,
            rot_euler=(0.0, math.radians(-22.0), math.radians(yaw_deg)),
            mat_idx=1,
            smooth=True,
        )

    apples_obj = _create_multimat_mesh_object(
        "CanopyApples", bm_apples, collection, [mat_apple, mat_leaf]
    )
    apples_obj.parent = tree_obj
    apples_obj.location = (0.0, 0.0, 0.0)

    return [tree_obj, apples_obj]


# ---------------------------------------------------------------------------
# 7. Drifting Cozy Pastel Feather (feather.glb)
# ---------------------------------------------------------------------------

def build_feather(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build a gracefully curved pastel drifting Feather with delicate barb notches (<= 400 tris)."""
    mat_cream = common.get_or_create_material("feather_cream")
    mat_sky = common.get_or_create_material("feather_sky")
    mat_peach = common.get_or_create_material("feather_peach")

    bm = bmesh.new()

    # 1. Curved slender ivory quill rachis sweeping gracefully upward
    n_spine = 10
    spine_pts: list[Vector] = []
    quill_rads: list[float] = []
    for i in range(n_spine):
        t = i / (n_spine - 1)
        x = 0.048 * math.sin(t * math.pi * 0.85) + 0.032 * (t ** 1.7)
        y = -0.022 * math.sin(t * math.pi)
        z = t * 0.46
        spine_pts.append(Vector((x, y, z)))
        quill_rads.append(0.0125 * (1.0 - 0.65 * t))

    _build_curved_tube(bm, spine_pts, quill_rads, tube_segs=5, mat_idx=0, smooth=True)

    # 2. Sleek tapered plush feather vane with two charming subtle barb notches
    vane_specs = [
        (0.18, 0.010, 0.010, 0.007, 0),
        (0.28, 0.052, 0.048, 0.012, 0),
        (0.40, 0.078, 0.072, 0.014, 0),
        (0.48, 0.048, 0.076, 0.013, 1),   # delicate left barb notch
        (0.56, 0.080, 0.075, 0.013, 1),
        (0.68, 0.070, 0.044, 0.012, 1),   # delicate right barb notch
        (0.76, 0.064, 0.064, 0.011, 2),
        (0.88, 0.042, 0.040, 0.009, 2),
        (0.96, 0.020, 0.018, 0.007, 2),
        (1.00, 0.004, 0.004, 0.005, 2),
    ]

    def _sample_spine(t: float) -> tuple[Vector, Vector]:
        ft = max(0.0, min(1.0, t)) * (n_spine - 1)
        idx = min(n_spine - 2, int(ft))
        frac = ft - idx
        pos = spine_pts[idx].lerp(spine_pts[idx + 1], frac)
        tang = (spine_pts[idx + 1] - spine_pts[idx]).normalized()
        return pos, tang

    vane_rows: list[tuple[bmesh.types.BMVert, bmesh.types.BMVert, bmesh.types.BMVert, bmesh.types.BMVert]] = []
    for vt, lw, rw, thick, _ in vane_specs:
        pos, tang = _sample_spine(vt)
        fwd = Vector((0.0, -1.0, 0.0))
        side = tang.cross(fwd).normalized()
        normal = side.cross(tang).normalized()

        cup = normal * (-0.012 * max(lw, rw) / 0.08)
        v_left = bm.verts.new(pos - side * lw + cup)
        v_front = bm.verts.new(pos + normal * thick)
        v_right = bm.verts.new(pos + side * rw + cup)
        v_back = bm.verts.new(pos - normal * thick)
        vane_rows.append((v_left, v_front, v_right, v_back))

    for i in range(len(vane_rows) - 1):
        a_l, a_f, a_r, a_b = vane_rows[i]
        b_l, b_f, b_r, b_b = vane_rows[i + 1]
        mi = vane_specs[i + 1][4]
        for quad in (
            (a_l, b_l, b_f, a_f),
            (a_f, b_f, b_r, a_r),
            (a_r, b_r, b_b, a_b),
            (a_b, b_b, b_l, a_l),
        ):
            f = bm.faces.new(quad)
            f.material_index = mi
            f.smooth = True

    s_l, s_f, s_r, s_b = vane_rows[0]
    for tri in ((s_l, s_f, s_b), (s_r, s_b, s_f)):
        f = bm.faces.new(tri)
        f.material_index = 0
        f.smooth = True
    e_l, e_f, e_r, e_b = vane_rows[-1]
    for tri in ((e_l, e_b, e_f), (e_r, e_f, e_b)):
        f = bm.faces.new(tri)
        f.material_index = 2
        f.smooth = True

    bmesh.ops.rotate(
        bm,
        cent=(0.0, 0.0, 0.0),
        matrix=Euler((0.0, math.radians(-18.0), 0.0), "XYZ").to_matrix(),
        verts=list(bm.verts),
    )

    feather_obj = _create_multimat_mesh_object(
        "feather", bm, collection, [mat_cream, mat_sky, mat_peach]
    )
    common.normalize_origin_to_base(feather_obj, center_xy=True, target_z=0.0)
    return [feather_obj]


# ---------------------------------------------------------------------------
# 8. Cozy Knitted Feather Blanket (knitted_blanket.glb)
# ---------------------------------------------------------------------------

def build_knitted_blanket(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build a snug knitted shawl blanket sized to drape cleanly around Larva & Adult Jelly Beans.

    CRITICAL FIT DESIGN:
    - Origin stays strictly at (0, 0, 0) aligned with `jellybean_larva.glb` (do NOT center XY!).
    - Hugs snugly around the back (+Y, clearing the Larva tail up to +0.39m) and left/right sides
      (±X, clearing belly width 0.295m), while leaving the entire front (-Y) face (Eyes at
      Z=0.314m, Cheeks at Z=0.236m, Mouth at Z=0.210m) completely unobstructed!
    - Budget: <= 400 tris, <= 20 KB.
    """
    mat_lavender = common.get_or_create_material("yarn_lavender")
    mat_butter = common.get_or_create_material("yarn_butter")
    mat_peach = common.get_or_create_material("yarn_peach")
    mat_mint = common.get_or_create_material("yarn_mint")
    mat_feather = common.get_or_create_material("feather_cream")

    bm = bmesh.new()

    u_steps = 10
    v_steps = 4
    max_theta = math.radians(128.0)

    # Snug plush shawl rings around Larva body (with +0.025m clearance & chunky knitted yarn wall):
    # (z_back, z_front_dip, rx_in, ry_back_in, ry_front_in, thickness, band_mat_idx)
    ring_specs = [
        (0.015, 0.015, 0.312, 0.415, 0.285, 0.036, 0),  # v=0: lower hem (lavender)
        (0.112, 0.092, 0.324, 0.428, 0.294, 0.042, 1),  # v=1: plush tail-clearing rib (butter)
        (0.212, 0.155, 0.318, 0.392, 0.286, 0.038, 2),  # v=2: mid-belly rib (peach)
        (0.305, 0.188, 0.296, 0.342, 0.270, 0.040, 3),  # v=3: upper shoulder rib (mint)
        (0.378, 0.205, 0.272, 0.308, 0.252, 0.044, 1),  # v=4: chunky folded collar (butter)
    ]

    inner_grid: list[list[bmesh.types.BMVert]] = []
    outer_grid: list[list[bmesh.types.BMVert]] = []

    for v_i, (z_back, z_front, rx_in, ry_b, ry_f, thick, _) in enumerate(ring_specs):
        in_row: list[bmesh.types.BMVert] = []
        out_row: list[bmesh.types.BMVert] = []
        for u_i in range(u_steps + 1):
            frac = -1.0 + 2.0 * (u_i / u_steps)
            theta = frac * max_theta
            sin_t = math.sin(theta)
            cos_t = math.cos(theta)

            front_blend = max(0.0, (-cos_t + 0.15) / 1.15) ** 1.4
            z = z_back * (1.0 - front_blend) + z_front * front_blend
            if v_i == 0:
                z += 0.007 * math.cos(u_i * math.pi)

            ry_in = ry_b if cos_t >= 0.0 else ry_f
            rib_swell = 0.007 if (v_i % 2 == 1) else 0.0

            ix = sin_t * rx_in
            iy = cos_t * ry_in
            ox = sin_t * (rx_in + thick + rib_swell)
            oy = cos_t * (ry_in + thick + rib_swell)
            oz = z + (0.012 if v_i == v_steps else 0.0)

            in_row.append(bm.verts.new((ix, iy, z)))
            out_row.append(bm.verts.new((ox, oy, oz)))
        inner_grid.append(in_row)
        outer_grid.append(out_row)

    for v_i in range(v_steps):
        band_mat = ring_specs[v_i][6]
        for u_i in range(u_steps):
            f_out = bm.faces.new((
                outer_grid[v_i][u_i],
                outer_grid[v_i][u_i + 1],
                outer_grid[v_i + 1][u_i + 1],
                outer_grid[v_i + 1][u_i],
            ))
            f_out.material_index = band_mat
            f_out.smooth = True

            f_in = bm.faces.new((
                inner_grid[v_i][u_i + 1],
                inner_grid[v_i][u_i],
                inner_grid[v_i + 1][u_i],
                inner_grid[v_i + 1][u_i + 1],
            ))
            f_in.material_index = band_mat
            f_in.smooth = True

    for u_i in range(u_steps):
        f_bot = bm.faces.new((
            inner_grid[0][u_i],
            inner_grid[0][u_i + 1],
            outer_grid[0][u_i + 1],
            outer_grid[0][u_i],
        ))
        f_bot.material_index = 0
        f_bot.smooth = True

        f_top = bm.faces.new((
            outer_grid[v_steps][u_i],
            outer_grid[v_steps][u_i + 1],
            inner_grid[v_steps][u_i + 1],
            inner_grid[v_steps][u_i],
        ))
        f_top.material_index = 1
        f_top.smooth = True

    for v_i in range(v_steps):
        band_mat = ring_specs[v_i][6]
        f_left = bm.faces.new((
            inner_grid[v_i][0],
            outer_grid[v_i][0],
            outer_grid[v_i + 1][0],
            inner_grid[v_i + 1][0],
        ))
        f_left.material_index = band_mat
        f_left.smooth = True

        f_right = bm.faces.new((
            outer_grid[v_i][u_steps],
            inner_grid[v_i][u_steps],
            inner_grid[v_i + 1][u_steps],
            outer_grid[v_i + 1][u_steps],
        ))
        f_right.material_index = band_mat
        f_right.smooth = True

    # Symmetric front knitted tie cord anchored cleanly INTO both mid-front lapels (zero gap!)
    left_anchor = inner_grid[2][0].co.lerp(outer_grid[2][0].co, 0.5)
    right_anchor = inner_grid[2][u_steps].co.lerp(outer_grid[2][u_steps].co, 0.5)
    tie_pts = [
        left_anchor,
        Vector((-0.14, -0.298, 0.132)),
        Vector((0.0, -0.320, 0.118)),
        Vector((0.14, -0.298, 0.132)),
        right_anchor,
    ]
    _build_curved_tube(bm, tie_pts, [0.015, 0.015, 0.017, 0.015, 0.015], tube_segs=4, mat_idx=2, smooth=True)

    # Twin fluffy knitted yarn pom-poms hanging joyfully at the front clasp
    for sgn in (-1.0, 1.0):
        _add_uvsphere(
            bm,
            u_segments=6,
            v_segments=4,
            radius=0.044,
            center_xyz=(sgn * 0.048, -0.328, 0.092),
            scale_xyz=(1.0, 0.95, 1.05),
            mat_idx=2 if sgn < 0 else 1,
            smooth=True,
        )

    # Cozy cream feather charm pinned clearly proud on the right shoulder lapel
    _add_leaf_diamond(
        bm,
        Vector((0.265, -0.175, 0.215)),
        length=0.145,
        width=0.062,
        thickness=0.026,
        rot_euler=(math.radians(20.0), math.radians(-58.0), math.radians(-26.0)),
        mat_idx=4,
        smooth=True,
    )

    min_z = min(v.co.z for v in bm.verts)
    if abs(min_z) > 1e-5:
        for v in bm.verts:
            v.co.z -= min_z

    blanket_obj = _create_multimat_mesh_object(
        "knitted_blanket",
        bm,
        collection,
        [mat_lavender, mat_butter, mat_peach, mat_mint, mat_feather],
    )
    blanket_obj.location = (0.0, 0.0, 0.0)
    blanket_obj.rotation_euler = (0.0, 0.0, 0.0)
    blanket_obj.scale = (1.0, 1.0, 1.0)
    return [blanket_obj]


# ---------------------------------------------------------------------------
# 9. Cozy Pastel Feather Loom Building (feather_loom.glb)
# ---------------------------------------------------------------------------

def build_feather_loom(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build the Feather Loom village building with animated `LoomShuttle` child (<= 1,500 tris)."""
    mat_wood = common.get_or_create_material("wood_wafer")
    mat_dark_wood = common.get_or_create_material("cottage_door")
    mat_cream = common.get_or_create_material("cream_frosting")
    mat_gold = common.get_or_create_material("brass_gold")
    mat_lavender = common.get_or_create_material("yarn_lavender")
    mat_butter = common.get_or_create_material("yarn_butter")
    mat_peach = common.get_or_create_material("yarn_peach")
    mat_mint = common.get_or_create_material("yarn_mint")
    mat_feather_c = common.get_or_create_material("feather_cream")
    mat_feather_s = common.get_or_create_material("feather_sky")

    loom_mats = [
        mat_wood,
        mat_dark_wood,
        mat_cream,
        mat_gold,
        mat_lavender,
        mat_butter,
        mat_peach,
        mat_mint,
        mat_feather_c,
        mat_feather_s,
    ]
    bm = bmesh.new()

    # 1. Cozy pastel oval craft rug base resting at Z = 0.0 .. 0.032
    _add_cylinder(
        bm,
        segments=14,
        radius1=0.68,
        radius2=0.66,
        depth=0.032,
        center_xyz=(0.0, 0.0, 0.016),
        mat_idx=5,
        smooth=False,
    )
    _add_cylinder(
        bm,
        segments=14,
        radius1=0.57,
        radius2=0.57,
        depth=0.036,
        center_xyz=(0.0, 0.0, 0.018),
        mat_idx=2,
        smooth=False,
    )

    # 2. Chunky wooden A-frame Loom structure
    for sx in (-0.36, 0.36):
        _add_box(bm, (0.095, 0.54, 0.085), (sx, 0.05, 0.072), mat_idx=1)
        _add_box(bm, (0.085, 0.090, 0.98), (sx, 0.04, 0.58), mat_idx=0)
        _add_box(
            bm,
            (0.068, 0.072, 0.72),
            (sx, 0.21, 0.42),
            mat_idx=1,
            rot_euler=(math.radians(24.0), 0.0, 0.0),
        )
        _add_uvsphere(
            bm,
            u_segments=8,
            v_segments=5,
            radius=0.056,
            center_xyz=(sx, 0.04, 1.11),
            scale_xyz=(1.0, 1.0, 1.0),
            mat_idx=3,
            smooth=True,
        )

    _add_box(bm, (0.86, 0.11, 0.095), (0.0, 0.04, 1.03), mat_idx=1)
    _add_box(bm, (0.56, 0.10, 0.065), (0.0, 0.04, 1.105), mat_idx=0)
    _add_box(bm, (0.72, 0.07, 0.065), (0.0, 0.04, 0.155), mat_idx=1)

    # Upper & lower horizontal warp yarn rollers + golden crank wheels
    for rz, r_mat in ((0.90, 2), (0.26, 2)):
        _add_cylinder(
            bm,
            segments=10,
            radius1=0.052,
            radius2=0.052,
            depth=0.68,
            center_xyz=(0.0, 0.03, rz),
            mat_idx=r_mat,
            rot_euler=(0.0, math.radians(90.0), 0.0),
            smooth=True,
        )
        _add_cylinder(
            bm,
            segments=8,
            radius1=0.075,
            radius2=0.075,
            depth=0.032,
            center_xyz=(0.43, 0.03, rz),
            mat_idx=3,
            rot_euler=(0.0, math.radians(90.0), 0.0),
            smooth=False,
        )

    # 3. Seven vertical cream warp yarn strings + wooden heddle bar
    for i in range(7):
        wx = -0.24 + i * 0.08
        _add_box(bm, (0.014, 0.014, 0.62), (wx, 0.03, 0.58), mat_idx=2)
    _add_box(bm, (0.68, 0.055, 0.045), (0.0, 0.025, 0.67), mat_idx=0)

    # 4. Half-woven cozy striped pastel feather-blanket cloth (Z = 0.27 .. 0.56)
    for sz, smat in ((0.305, 4), (0.375, 5), (0.445, 6), (0.515, 7)):
        _add_box(bm, (0.58, 0.042, 0.072), (0.0, 0.025, sz), mat_idx=smat)
        _add_box(bm, (0.59, 0.018, 0.028), (0.0, -0.002, sz), mat_idx=smat)

    # 5. Cozy weaver's wooden footstool cleanly in front of the loom runners (-Y)
    _add_box(bm, (0.38, 0.21, 0.045), (0.0, -0.40, 0.21), mat_idx=0)
    _add_box(bm, (0.34, 0.18, 0.036), (0.0, -0.40, 0.248), mat_idx=7)
    for lx in (-0.14, 0.14):
        for ly in (-0.46, -0.34):
            _add_box(bm, (0.042, 0.042, 0.18), (lx, ly, 0.105), mat_idx=1)

    # 6. Woven Wicker Feather & Yarn Basket tucked neatly beside the left upright
    bx, by = -0.56, -0.10
    _add_cylinder(
        bm,
        segments=10,
        radius1=0.125,
        radius2=0.158,
        depth=0.22,
        center_xyz=(bx, by, 0.125),
        mat_idx=0,
        smooth=False,
    )
    _add_cylinder(
        bm,
        segments=10,
        radius1=0.168,
        radius2=0.168,
        depth=0.036,
        center_xyz=(bx, by, 0.235),
        mat_idx=1,
        smooth=False,
    )
    _add_uvsphere(
        bm,
        u_segments=8,
        v_segments=5,
        radius=0.078,
        center_xyz=(bx - 0.045, by - 0.035, 0.265),
        scale_xyz=(1.0, 1.0, 0.95),
        mat_idx=6,
        smooth=True,
    )
    _add_uvsphere(
        bm,
        u_segments=8,
        v_segments=5,
        radius=0.072,
        center_xyz=(bx + 0.052, by - 0.015, 0.258),
        scale_xyz=(1.0, 1.0, 0.95),
        mat_idx=4,
        smooth=True,
    )
    _add_leaf_diamond(
        bm,
        Vector((bx - 0.02, by + 0.04, 0.24)),
        length=0.24,
        width=0.088,
        thickness=0.024,
        rot_euler=(math.radians(15.0), math.radians(-78.0), math.radians(18.0)),
        mat_idx=8,
        smooth=True,
    )
    _add_leaf_diamond(
        bm,
        Vector((bx + 0.04, by + 0.05, 0.23)),
        length=0.22,
        width=0.082,
        thickness=0.022,
        rot_euler=(math.radians(-12.0), math.radians(-68.0), math.radians(-28.0)),
        mat_idx=9,
        smooth=True,
    )

    loom_obj = _create_multimat_mesh_object("feather_loom", bm, collection, loom_mats)
    common.normalize_origin_to_base(loom_obj, center_xy=False, target_z=0.0)

    # 7. Distinct `LoomShuttle` child mesh
    bm_shuttle = bmesh.new()
    _add_box(bm_shuttle, (0.20, 0.068, 0.044), (0.0, 0.0, 0.0), mat_idx=0)
    for sgn in (-1.0, 1.0):
        _add_cylinder(
            bm_shuttle,
            segments=4,
            radius1=0.042,
            radius2=0.006,
            depth=0.085,
            center_xyz=(sgn * 0.14, 0.0, 0.0),
            mat_idx=0,
            rot_euler=(0.0, sgn * math.radians(90.0), 0.0),
            smooth=False,
        )
    _add_cylinder(
        bm_shuttle,
        segments=8,
        radius1=0.036,
        radius2=0.036,
        depth=0.11,
        center_xyz=(0.0, -0.012, 0.016),
        mat_idx=1,
        rot_euler=(0.0, math.radians(90.0), 0.0),
        smooth=True,
    )

    shuttle_obj = _create_multimat_mesh_object(
        "LoomShuttle", bm_shuttle, collection, [mat_dark_wood, mat_peach]
    )
    shuttle_obj.parent = loom_obj
    shuttle_obj.location = (0.06, -0.042, 0.568)

    return [loom_obj, shuttle_obj]


# ---------------------------------------------------------------------------
# Fit Check Verification Helper: Knitted Blanket on Larva Jelly Bean
# ---------------------------------------------------------------------------

def _verify_blanket_fit_on_larva(blanket_objs: list[bpy.types.Object]) -> dict[str, object]:
    """Temporarily build `jellybean_larva` at origin to verify clearance & render fit thumb."""
    import build_pet_core  # noqa: E402

    fit_coll = common.ensure_collection("_TempLarvaFitCheck")
    larva_objs = build_pet_core.build_jellybean_larva(fit_coll)
    bpy.context.view_layer.update()

    larva_body = next(o for o in larva_objs if o.name == "Body")
    larva_eyes = [o for o in larva_objs if o.name.startswith("Eye_")]
    blanket = blanket_objs[0]

    larva_min, larva_max = common.get_combined_bounds([larva_body])
    blanket_min, blanket_max = common.get_combined_bounds([blanket])
    eyes_min, eyes_max = common.get_combined_bounds(larva_eyes)

    assert blanket_max.x > larva_max.x + 0.02, (
        f"Blanket X max {blanket_max.x:.3f} clips larva X max {larva_max.x:.3f}"
    )
    assert blanket_min.x < larva_min.x - 0.02, (
        f"Blanket X min {blanket_min.x:.3f} clips larva X min {larva_min.x:.3f}"
    )
    assert blanket_max.y > larva_max.y + 0.02, (
        f"Blanket +Y back {blanket_max.y:.3f} clips larva tail {larva_max.y:.3f}"
    )

    fit_thumb = common.render_icon_png(
        [*larva_objs, *blanket_objs],
        common.THUMBNAIL_DIR / "knitted_blanket_fitted_thumb.png",
        size=512,
        transparent=False,
        bg_hex="#D7F3FF",
        cam_azimuth_deg=26.0,
        cam_elevation_deg=16.0,
        ortho=False,
        margin=1.30,
        samples=24,
    )

    for obj in list(fit_coll.objects):
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is not None and data.users == 0 and isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)
    bpy.context.scene.collection.children.unlink(fit_coll)
    bpy.data.collections.remove(fit_coll)

    return {
        "larva_bounds": (tuple(round(c, 4) for c in larva_min), tuple(round(c, 4) for c in larva_max)),
        "blanket_bounds": (
            tuple(round(c, 4) for c in blanket_min),
            tuple(round(c, 4) for c in blanket_max),
        ),
        "eyes_z_range": (round(eyes_min.z, 4), round(eyes_max.z, 4)),
        "fitted_thumb": fit_thumb,
    }


# ---------------------------------------------------------------------------
# Main Build Entrypoint
# ---------------------------------------------------------------------------

def main() -> dict[str, object]:
    common.ensure_dirs()
    common.reset_scene()

    plot_coll = common.ensure_collection("GardenPlot")
    parsley_coll = common.ensure_collection("CropParsley")
    tomato_coll = common.ensure_collection("CropTomato")
    cane_coll = common.ensure_collection("CropCandyCane")
    beans_coll = common.ensure_collection("Crop100Beans")
    tree_coll = common.ensure_collection("AppleTree")
    feather_coll = common.ensure_collection("Feather")
    blanket_coll = common.ensure_collection("KnittedBlanket")
    loom_coll = common.ensure_collection("FeatherLoom")
    studio_coll = common.ensure_collection("Studio")

    plot_objs = build_garden_plot(plot_coll)
    parsley_objs = build_crop_parsley(parsley_coll)
    tomato_objs = build_crop_tomato(tomato_coll)
    cane_objs = build_crop_candycane(cane_coll)
    beans_objs = build_crop_100beans(beans_coll)
    tree_objs = build_apple_tree(tree_coll)
    feather_objs = build_feather(feather_coll)
    blanket_objs = build_knitted_blanket(blanket_coll)
    loom_objs = build_feather_loom(loom_coll)

    common.setup_world_lighting("#D7F3FF", strength=0.65)
    common.setup_studio_lights(studio_coll)

    cam_data = bpy.data.cameras.new("PreviewCamera")
    cam_data.lens = 50.0
    cam_obj = bpy.data.objects.new("PreviewCamera", cam_data)
    cam_obj.location = (1.35, -2.55, 1.45)
    studio_coll.objects.link(cam_obj)
    common.point_camera_at(cam_obj, Vector((0.0, 0.0, 0.72)))
    bpy.context.scene.camera = cam_obj

    asset_specs = [
        ("garden_plot", plot_objs, 400, 20 * 1024, (30.0, 28.0, 1.24), (32.0, 28.0, 1.34)),
        ("crop_parsley", parsley_objs, 400, 20 * 1024, (24.0, 24.0, 1.20), (26.0, 24.0, 1.30)),
        ("crop_tomato", tomato_objs, 400, 20 * 1024, (20.0, 16.0, 1.20), (24.0, 18.0, 1.30)),
        ("crop_candycane", cane_objs, 400, 20 * 1024, (18.0, 12.0, 1.20), (22.0, 14.0, 1.30)),
        ("crop_100beans", beans_objs, 400, 20 * 1024, (22.0, 20.0, 1.20), (24.0, 22.0, 1.30)),
        ("apple_tree", tree_objs, 1000, 45 * 1024, (22.0, 14.0, 1.22), (24.0, 16.0, 1.32)),
        ("feather", feather_objs, 400, 20 * 1024, (14.0, 12.0, 1.20), (18.0, 14.0, 1.28)),
        ("knitted_blanket", blanket_objs, 400, 20 * 1024, (24.0, 18.0, 1.22), (28.0, 20.0, 1.32)),
        ("feather_loom", loom_objs, 1500, 65 * 1024, (24.0, 16.0, 1.24), (26.0, 18.0, 1.36)),
    ]

    models_report: dict[str, dict[str, object]] = {}
    icons_report: dict[str, dict[str, object]] = {}
    thumbs_report: dict[str, dict[str, object]] = {}

    for name, objs, max_tris, max_bytes, icon_cam, thumb_cam in asset_specs:
        glb_info = common.export_glb(objs, common.PUBLIC_MODELS_DIR / f"{name}.glb")
        models_report[name] = glb_info

        icons_report[name] = common.render_icon_png(
            objs,
            common.PUBLIC_ICONS_DIR / f"{name}.png",
            size=128,
            transparent=True,
            cam_azimuth_deg=icon_cam[0],
            cam_elevation_deg=icon_cam[1],
            ortho=True,
            margin=icon_cam[2],
            samples=32,
        )

        thumbs_report[name] = common.render_icon_png(
            objs,
            common.THUMBNAIL_DIR / f"{name}_thumb.png",
            size=512,
            transparent=False,
            bg_hex="#D7F3FF",
            cam_azimuth_deg=thumb_cam[0],
            cam_elevation_deg=thumb_cam[1],
            ortho=False,
            margin=thumb_cam[2],
            samples=24,
        )

    fit_report = _verify_blanket_fit_on_larva(blanket_objs)

    common.setup_world_lighting("#D7F3FF", strength=0.65)
    for name, objs, *_ in asset_specs:
        visible = name == "apple_tree"
        for obj in objs:
            obj.hide_viewport = not visible
            obj.hide_render = not visible
    bpy.context.view_layer.objects.active = tree_objs[0]

    blend_path = common.BLEND_DIR / "farm_m3.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    for name, objs, max_tris, max_bytes, *_ in asset_specs:
        info = models_report[name]
        assert info["triangles"] <= max_tris, (
            f"{name} tris {info['triangles']} > {max_tris}"
        )
        assert info["size_bytes"] <= max_bytes, (
            f"{name} size {info['size_bytes']} > {max_bytes}"
        )
        root_obj = objs[0]
        assert tuple(round(c, 5) for c in root_obj.location) == (0.0, 0.0, 0.0), (
            f"{root_obj.name} origin not (0,0,0): {tuple(root_obj.location)}"
        )
        assert tuple(round(c, 5) for c in root_obj.scale) == (1.0, 1.0, 1.0), (
            f"{root_obj.name} scale not (1,1,1): {tuple(root_obj.scale)}"
        )

    return {
        "blend_path": str(blend_path),
        "models": models_report,
        "icons": icons_report,
        "thumbnails": thumbs_report,
        "blanket_fit": fit_report,
    }


if __name__ == "__main__":
    summary = main()
    print(summary)
