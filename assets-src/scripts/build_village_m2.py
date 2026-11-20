"""Build PR-08 Village Buildings, Currencies & Dr. Bubblegum Asset Pack via Blender MCP.

Generates:
  - assets-src/blend/village_m2.blend
  - public/assets/models/dr_bubblegum.glb     (<= 2,000 tris, <= 75 KB)
  - public/assets/models/toilet.glb           (<= 1,000 tris, <= 65 KB)
  - public/assets/models/hamburger_stand.glb  (<= 1,500 tris, <= 65 KB)
  - public/assets/models/jelly_coin.glb       (<= 400 tris,   <= 20 KB)
  - public/assets/models/bean_buck.glb        (<= 400 tris,   <= 20 KB)
  - public/assets/models/bonus_bean.glb       (<= 400 tris,   <= 20 KB)
  - public/assets/icons/dr_bubblegum.png      (128x128 transparent PNG portrait)
  - public/assets/icons/toilet.png            (128x128 transparent PNG)
  - public/assets/icons/hamburger_stand.png   (128x128 transparent PNG)
  - public/assets/icons/jelly_coin.png        (128x128 transparent PNG)
  - public/assets/icons/bean_buck.png         (128x128 transparent PNG)
  - public/assets/icons/bonus_bean.png        (128x128 transparent PNG)

Can be executed inside Blender MCP (`execute_blender_code`) or headless via:
    blender --background --python assets-src/scripts/build_village_m2.py
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
    smooth: bool = False,
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


def _add_torus(
    bm: bmesh.types.BMesh,
    major_radius: float,
    minor_radius: float,
    major_segs: int,
    minor_segs: int,
    center_xyz: tuple[float, float, float],
    mat_idx: int,
    rot_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
    smooth: bool = True,
) -> list[bmesh.types.BMFace]:
    """Append a low-poly torus ring (lies in local XY plane before `rot_euler`)."""
    xform = (
        Matrix.Translation(center_xyz)
        @ Euler(rot_euler, "XYZ").to_matrix().to_4x4()
    )
    rings: list[list[bmesh.types.BMVert]] = []
    for i in range(major_segs):
        theta = (2.0 * math.pi * i) / major_segs
        ct, st = math.cos(theta), math.sin(theta)
        ring: list[bmesh.types.BMVert] = []
        for j in range(minor_segs):
            phi = (2.0 * math.pi * j) / minor_segs
            cp, sp = math.cos(phi), math.sin(phi)
            r = major_radius + minor_radius * cp
            local_pt = Vector((r * ct, r * st, minor_radius * sp))
            ring.append(bm.verts.new(xform @ local_pt))
        rings.append(ring)

    faces: list[bmesh.types.BMFace] = []
    for i in range(major_segs):
        ra = rings[i]
        rb = rings[(i + 1) % major_segs]
        for j in range(minor_segs):
            jn = (j + 1) % minor_segs
            f = bm.faces.new((ra[j], rb[j], rb[jn], ra[jn]))
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


def _add_heart_prism(
    bm: bmesh.types.BMesh,
    center_xyz: tuple[float, float, float],
    scale: float,
    thickness: float,
    mat_idx: int,
) -> list[bmesh.types.BMFace]:
    """Add a clean, non-concave triangulated 3D heart badge facing -Y."""
    cx, cy, cz = center_xyz
    # 10-point heart outline around center (0, 0) in XZ plane
    outline = [
        (0.0, -0.95),     # bottom point
        (-0.58, -0.35),   # lower left
        (-0.92, 0.25),    # mid left
        (-0.76, 0.78),    # upper left lobe
        (-0.32, 0.90),    # top left crest
        (0.0, 0.48),      # center cleft
        (0.32, 0.90),     # top right crest
        (0.76, 0.78),     # upper right lobe
        (0.92, 0.25),     # mid right
        (0.58, -0.35),    # lower right
    ]
    y_f = cy - thickness * 0.5
    y_b = cy + thickness * 0.5
    cf = bm.verts.new((cx, y_f - thickness * 0.18, cz + 0.05 * scale))
    cb = bm.verts.new((cx, y_b, cz + 0.05 * scale))
    vf = [bm.verts.new((cx + ox * scale, y_f, cz + oz * scale)) for ox, oz in outline]
    vb = [bm.verts.new((cx + ox * scale, y_b, cz + oz * scale)) for ox, oz in outline]

    n = len(outline)
    faces: list[bmesh.types.BMFace] = []
    for i in range(n):
        inext = (i + 1) % n
        faces.append(bm.faces.new((cf, vf[i], vf[inext])))
        faces.append(bm.faces.new((cb, vb[inext], vb[i])))
        faces.append(bm.faces.new((vf[i], vb[i], vb[inext], vf[inext])))
    for f in faces:
        f.material_index = mat_idx
        f.smooth = False
    return faces


def _add_crescent_moon(
    bm: bmesh.types.BMesh,
    center_xz: tuple[float, float],
    y_front: float,
    y_back: float,
    outer_r: float,
    mat_idx: int,
    steps: int = 8,
) -> list[bmesh.types.BMFace]:
    """Build a crisp manifold crescent moon via paired outer/inner arc quads (zero concave n-gons)."""
    cx, cz = center_xz
    ang_start = math.radians(52.0)
    ang_end = math.radians(308.0)

    # Outer C-curve vertices and inner indented curve vertices sharing the exact two sharp tips
    outer_pts: list[tuple[float, float]] = []
    inner_pts: list[tuple[float, float]] = []
    for i in range(steps + 1):
        t = i / steps
        ang = ang_start + t * (ang_end - ang_start)
        ox = cx + outer_r * math.cos(ang)
        oz = cz + outer_r * math.sin(ang)
        outer_pts.append((ox, oz))
        # Crescent belly thickness peaks smoothly at middle (t=0.5) and tapers cleanly to 0 at tips!
        belly = math.sin(math.pi * t)
        # Shift inner arc to the right (+X) toward the concavity
        ix = ox + outer_r * 0.62 * belly
        iz = oz * 1.0
        inner_pts.append((ix, iz))

    of = [bm.verts.new((x, y_front, z)) for x, z in outer_pts]
    ob = [bm.verts.new((x, y_back, z)) for x, z in outer_pts]
    # Tips share vertices at index 0 and index `steps`
    inf = [of[0]] + [bm.verts.new((x, y_front, z)) for x, z in inner_pts[1:-1]] + [of[-1]]
    inb = [ob[0]] + [bm.verts.new((x, y_back, z)) for x, z in inner_pts[1:-1]] + [ob[-1]]

    faces: list[bmesh.types.BMFace] = []
    for i in range(steps):
        if i == 0:
            # Start tip triangle (front & back)
            faces.append(bm.faces.new((of[0], of[1], inf[1])))
            faces.append(bm.faces.new((ob[0], inb[1], ob[1])))
        elif i == steps - 1:
            # End tip triangle (front & back)
            faces.append(bm.faces.new((of[i], of[i + 1], inf[i])))
            faces.append(bm.faces.new((ob[i], inb[i], ob[i + 1])))
        else:
            # Clean convex quad slice across the crescent body
            faces.append(bm.faces.new((of[i], of[i + 1], inf[i + 1], inf[i])))
            faces.append(bm.faces.new((ob[i], inb[i], inb[i + 1], ob[i + 1])))

        # Outer & inner extruded side ribbons
        faces.append(bm.faces.new((of[i], ob[i], ob[i + 1], of[i + 1])))
        faces.append(bm.faces.new((inf[i + 1], inb[i + 1], inb[i], inf[i])))

    for f in faces:
        f.material_index = mat_idx
        f.smooth = False
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
# 1. Dr. Bubblegum NPC (dr_bubblegum.glb)
# ---------------------------------------------------------------------------

def build_dr_bubblegum(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build Dr. Bubblegum — glossy crunchy-pink sphere professor (<= 2,000 tris).

    Hierarchy (origin at ground-center (0, 0, 0), front facing -Y in Blender -> +Z Three.js):
      dr_bubblegum (Empty)
        ├── Body       (Mesh: white lab coat, mint vest, bowtie, marshmallow-heart gold pin, shoes)
        ├── Head       (Empty at neck pivot)
        │    ├── HeadMesh (Mesh: glossy bubblegum sphere, eyes, brows, smile, gold spectacles)
        │    └── Hat      (Empty at crown pivot)
        │         └── HatMesh (Mesh: scholar mortarboard cap + gold tassel)
        ├── Arm_L      (Empty at left shoulder pivot)
        │    └── Arm_L_Mesh
        └── Arm_R      (Empty at right shoulder pivot — rotates for door-knock & cane-tap!)
             ├── Arm_R_Mesh
             └── Cane
    """
    mat_pink = common.get_or_create_material("dr_bubblegum_shell")
    mat_coat = common.get_or_create_material("labcoat_white")
    mat_plum = common.get_or_create_material("prof_plum")
    mat_bowtie = common.get_or_create_material("prof_bowtie")
    mat_vest = common.get_or_create_material("prof_vest")
    mat_gold = common.get_or_create_material("brass_gold")
    mat_eye = common.get_or_create_material("eye_licorice")
    mat_shine = common.get_or_create_material("eye_highlight")
    mat_brow = common.get_or_create_material("brow_licorice")
    mat_cheek = common.get_or_create_material("cheek_blush")
    mat_cane_wood = common.get_or_create_material("cottage_door")

    root = bpy.data.objects.new("dr_bubblegum", None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.25
    root.location = (0.0, 0.0, 0.0)
    collection.objects.link(root)

    # --- 1. Body: Crisp white lab coat, mint waistcoat, bowtie, marshmallow heart pin & shoes ---
    # Materials: 0: coat, 1: vest, 2: plum, 3: bowtie, 4: gold, 5: pink
    bm_body = bmesh.new()

    # Two chunky dark-plum shoes resting strictly on Z = 0.0
    for sgn in (-1.0, 1.0):
        _add_uvsphere(
            bm_body,
            u_segments=8,
            v_segments=4,
            radius=1.0,
            center_xyz=(sgn * 0.095, -0.025, 0.048),
            scale_xyz=(0.068, 0.096, 0.048),
            mat_idx=2,
            smooth=True,
        )
        _add_cylinder(
            bm_body,
            segments=6,
            radius1=0.046,
            radius2=0.052,
            depth=0.10,
            center_xyz=(sgn * 0.092, 0.0, 0.115),
            mat_idx=2,
            smooth=False,
        )

    # Flared white lab coat bell torso (Z = 0.13 .. 0.51)
    _add_cylinder(
        bm_body,
        segments=12,
        radius1=0.222,
        radius2=0.168,
        depth=0.38,
        center_xyz=(0.0, 0.0, 0.32),
        mat_idx=0,
        smooth=True,
    )

    # Mint waistcoat panel visible in the open front V of the lab coat
    _add_cylinder(
        bm_body,
        segments=8,
        radius1=0.172,
        radius2=0.145,
        depth=0.33,
        center_xyz=(0.0, -0.044, 0.325),
        mat_idx=1,
        smooth=True,
    )
    # Two gold waistcoat buttons down center front
    for bz in (0.26, 0.35):
        _add_box(
            bm_body,
            (0.022, 0.016, 0.022),
            (0.0, -0.205 + (bz - 0.24) * 0.14, bz),
            mat_idx=4,
            rot_euler=(0.0, math.radians(45.0), 0.0),
        )

    # Crisp white open coat front panels & V-lapel collar flaps
    for sgn in (-1.0, 1.0):
        _add_box(
            bm_body,
            (0.112, 0.052, 0.352),
            (sgn * 0.115, -0.155, 0.312),
            mat_idx=0,
            rot_euler=(math.radians(-6.0), 0.0, sgn * math.radians(-22.0)),
            smooth=False,
        )
        _add_box(
            bm_body,
            (0.088, 0.048, 0.142),
            (sgn * 0.118, -0.148, 0.452),
            mat_idx=0,
            rot_euler=(math.radians(10.0), sgn * math.radians(-18.0), sgn * math.radians(-26.0)),
            smooth=False,
        )

    # Marshmallow collar ring snug around neck (Z = 0.505)
    _add_torus(
        bm_body,
        major_radius=0.138,
        minor_radius=0.032,
        major_segs=10,
        minor_segs=4,
        center_xyz=(0.0, -0.010, 0.505),
        mat_idx=0,
        smooth=True,
    )

    # Strawberry-pink professor bowtie right under his chin!
    for sgn in (-1.0, 1.0):
        _add_box(
            bm_body,
            (0.072, 0.030, 0.048),
            (sgn * 0.045, -0.178, 0.482),
            mat_idx=3,
            rot_euler=(0.0, sgn * math.radians(16.0), sgn * math.radians(-14.0)),
            smooth=False,
        )
    _add_box(bm_body, (0.036, 0.034, 0.036), (0.0, -0.186, 0.482), mat_idx=3)

    # Crisp "Marshmallow with a Heart of Gold" Lapel Pin on left chest (+X side)
    pin_cx, pin_cy, pin_cz = 0.128, -0.194, 0.415
    _add_heart_prism(bm_body, (pin_cx, pin_cy, pin_cz), scale=0.044, thickness=0.020, mat_idx=0)
    _add_heart_prism(bm_body, (pin_cx, pin_cy - 0.012, pin_cz), scale=0.027, thickness=0.016, mat_idx=4)

    # Ensure lowest shoe vertex sits strictly at Z = 0.0
    min_z_body = min(v.co.z for v in bm_body.verts)
    if abs(min_z_body) > 1e-5:
        for v in bm_body.verts:
            v.co.z -= min_z_body

    body_obj = _create_multimat_mesh_object(
        "Body", bm_body, collection, [mat_coat, mat_vest, mat_plum, mat_bowtie, mat_gold, mat_pink]
    )
    body_obj.parent = root
    body_obj.location = (0.0, 0.0, 0.0)

    # --- 2. Head Pivot Empty + Crunchy-Pink Bubblegum Sphere HeadMesh ---
    head_empty = bpy.data.objects.new("Head", None)
    head_empty.empty_display_type = "PLAIN_AXES"
    head_empty.empty_display_size = 0.14
    head_empty.parent = root
    head_empty.location = (0.0, 0.0, 0.52)
    collection.objects.link(head_empty)

    # HeadMesh materials: 0: pink, 1: eye, 2: shine, 3: brow, 4: cheek, 5: gold
    bm_head = bmesh.new()
    head_r = 0.228
    head_cz = 0.215

    # Glossy crunchy-pink bubblegum sphere (16x10 UV sphere -> 288 tris)
    _add_uvsphere(
        bm_head,
        u_segments=16,
        v_segments=10,
        radius=head_r,
        center_xyz=(0.0, 0.0, head_cz),
        scale_xyz=(1.02, 0.98, 0.98),
        mat_idx=0,
        smooth=True,
    )

    # Expressive glossy eyes behind the gold spectacles
    eye_x_abs = 0.088
    eye_z = head_cz + 0.018
    eye_y = -head_r * 0.90
    for sgn in (-1.0, 1.0):
        _add_uvsphere(
            bm_head,
            u_segments=8,
            v_segments=5,
            radius=0.044,
            center_xyz=(sgn * eye_x_abs, eye_y, eye_z),
            scale_xyz=(0.95, 0.55, 1.05),
            mat_idx=1,
            smooth=True,
        )
        # Crisp bright catchlight
        _add_uvsphere(
            bm_head,
            u_segments=6,
            v_segments=3,
            radius=0.016,
            center_xyz=(sgn * eye_x_abs + 0.014, eye_y - 0.022, eye_z + 0.015),
            scale_xyz=(1.0, 0.65, 1.0),
            mat_idx=2,
            smooth=True,
        )

        # Stern-but-kind professor eyebrows
        brow_pts = [
            Vector((sgn * (eye_x_abs - 0.046), eye_y - 0.008, eye_z + 0.068)),
            Vector((sgn * eye_x_abs, eye_y - 0.016, eye_z + 0.082)),
            Vector((sgn * (eye_x_abs + 0.046), eye_y - 0.002, eye_z + 0.084)),
        ]
        if sgn < 0.0:
            brow_pts.reverse()
        _build_curved_tube(bm_head, brow_pts, [0.012, 0.016, 0.011], tube_segs=4, mat_idx=3, smooth=True)

        # Soft rosy cheeks seated flush on the bubblegum sphere
        _add_uvsphere(
            bm_head,
            u_segments=6,
            v_segments=3,
            radius=0.036,
            center_xyz=(sgn * 0.145, -head_r * 0.68, head_cz - 0.045),
            scale_xyz=(1.1, 0.42, 0.70),
            mat_idx=4,
            rot_euler=(0.0, 0.0, sgn * math.radians(-28.0)),
            smooth=True,
        )

    # Gleaming Gold Round Spectacles perched crisply across his eyes!
    spec_y = -head_r * 0.99
    spec_r = 0.072
    spec_tube = 0.014
    for sgn in (-1.0, 1.0):
        _add_torus(
            bm_head,
            major_radius=spec_r,
            minor_radius=spec_tube,
            major_segs=10,
            minor_segs=4,
            center_xyz=(sgn * eye_x_abs, spec_y, eye_z),
            mat_idx=5,
            rot_euler=(math.radians(90.0), 0.0, sgn * math.radians(-10.0)),
            smooth=True,
        )
        # Side gold temple arm connecting neatly from rim edge back along head
        _add_box(
            bm_head,
            (0.014, 0.14, 0.014),
            (sgn * (eye_x_abs + spec_r + 0.006), spec_y + 0.072, eye_z + 0.004),
            mat_idx=5,
            rot_euler=(0.0, 0.0, sgn * math.radians(16.0)),
            smooth=False,
        )
    # Gold nose bridge connecting the two spectacle rims
    _add_box(
        bm_head,
        (0.046, 0.016, 0.016),
        (0.0, spec_y - 0.006, eye_z + 0.010),
        mat_idx=5,
        smooth=False,
    )

    # Warm gentle smile
    smile_pts = [
        Vector((-0.056, -head_r * 0.87, head_cz - 0.074)),
        Vector((-0.024, -head_r * 0.93, head_cz - 0.090)),
        Vector((0.0, -head_r * 0.95, head_cz - 0.094)),
        Vector((0.024, -head_r * 0.93, head_cz - 0.090)),
        Vector((0.056, -head_r * 0.87, head_cz - 0.074)),
    ]
    _build_curved_tube(
        bm_head, smile_pts, [0.008, 0.012, 0.013, 0.012, 0.008], tube_segs=4, mat_idx=1, smooth=True
    )

    head_mesh = _create_multimat_mesh_object(
        "HeadMesh", bm_head, collection, [mat_pink, mat_eye, mat_shine, mat_brow, mat_cheek, mat_gold]
    )
    head_mesh.parent = head_empty
    head_mesh.location = (0.0, 0.0, 0.0)

    # --- 3. Hat Pivot Empty + Scholar Mortarboard Cap (child of Head) ---
    hat_empty = bpy.data.objects.new("Hat", None)
    hat_empty.empty_display_type = "PLAIN_AXES"
    hat_empty.empty_display_size = 0.12
    hat_empty.parent = head_empty
    hat_empty.location = (0.0, 0.012, head_cz + head_r - 0.028)
    collection.objects.link(hat_empty)

    bm_hat = bmesh.new()
    _add_cylinder(
        bm_hat,
        segments=10,
        radius1=0.145,
        radius2=0.128,
        depth=0.075,
        center_xyz=(0.0, 0.0, 0.022),
        mat_idx=0,
        smooth=False,
    )
    board_rot = (math.radians(-6.0), math.radians(4.0), math.radians(45.0))
    _add_box(
        bm_hat,
        (0.32, 0.32, 0.026),
        (0.0, 0.0, 0.068),
        mat_idx=0,
        rot_euler=board_rot,
        smooth=False,
    )
    _add_cylinder(
        bm_hat,
        segments=6,
        radius1=0.024,
        radius2=0.020,
        depth=0.022,
        center_xyz=(0.0, 0.0, 0.088),
        mat_idx=1,
        smooth=False,
    )
    tassel_pts = [
        Vector((0.0, 0.0, 0.086)),
        Vector((0.105, -0.040, 0.080)),
        Vector((0.185, -0.065, 0.052)),
        Vector((0.205, -0.072, -0.025)),
    ]
    _build_curved_tube(
        bm_hat, tassel_pts, [0.008, 0.008, 0.008, 0.009], tube_segs=4, mat_idx=1, smooth=True
    )
    _add_cylinder(
        bm_hat,
        segments=6,
        radius1=0.022,
        radius2=0.009,
        depth=0.055,
        center_xyz=(0.208, -0.074, -0.055),
        mat_idx=1,
        smooth=False,
    )

    hat_mesh = _create_multimat_mesh_object("HatMesh", bm_hat, collection, [mat_plum, mat_gold])
    hat_mesh.parent = hat_empty
    hat_mesh.location = (0.0, 0.0, 0.0)

    # --- 4. Left Arm Pivot Empty + Sleeve & Hand ---
    arm_l = bpy.data.objects.new("Arm_L", None)
    arm_l.empty_display_type = "PLAIN_AXES"
    arm_l.empty_display_size = 0.10
    arm_l.parent = root
    arm_l.location = (-0.165, 0.0, 0.435)
    collection.objects.link(arm_l)

    bm_arml = bmesh.new()
    # Rounded shoulder seam cap
    _add_uvsphere(
        bm_arml, 6, 4, 0.048, (0.0, 0.0, 0.0), (1.0, 1.0, 1.0), mat_idx=0, smooth=True
    )
    _add_cylinder(
        bm_arml,
        segments=6,
        radius1=0.050,
        radius2=0.044,
        depth=0.19,
        center_xyz=(-0.036, -0.015, -0.088),
        mat_idx=0,
        rot_euler=(math.radians(8.0), math.radians(-18.0), 0.0),
        smooth=True,
    )
    _add_uvsphere(
        bm_arml,
        u_segments=8,
        v_segments=5,
        radius=0.044,
        center_xyz=(-0.068, -0.030, -0.188),
        scale_xyz=(1.0, 1.0, 1.0),
        mat_idx=1,
        smooth=True,
    )
    arm_l_mesh = _create_multimat_mesh_object("Arm_L_Mesh", bm_arml, collection, [mat_coat, mat_pink])
    arm_l_mesh.parent = arm_l
    arm_l_mesh.location = (0.0, 0.0, 0.0)

    # --- 5. Right Arm Pivot Empty + Sleeve, Hand & Professor Walking Cane ---
    arm_r = bpy.data.objects.new("Arm_R", None)
    arm_r.empty_display_type = "PLAIN_AXES"
    arm_r.empty_display_size = 0.10
    arm_r.parent = root
    arm_r.location = (0.165, 0.0, 0.435)
    collection.objects.link(arm_r)

    bm_armr = bmesh.new()
    _add_uvsphere(
        bm_armr, 6, 4, 0.048, (0.0, 0.0, 0.0), (1.0, 1.0, 1.0), mat_idx=0, smooth=True
    )
    _add_cylinder(
        bm_armr,
        segments=6,
        radius1=0.050,
        radius2=0.044,
        depth=0.19,
        center_xyz=(0.046, -0.052, -0.068),
        mat_idx=0,
        rot_euler=(math.radians(32.0), math.radians(22.0), 0.0),
        smooth=True,
    )
    hand_r_local = Vector((0.094, -0.112, -0.138))
    _add_uvsphere(
        bm_armr,
        u_segments=8,
        v_segments=5,
        radius=0.044,
        center_xyz=(hand_r_local.x, hand_r_local.y, hand_r_local.z),
        scale_xyz=(1.0, 1.0, 1.0),
        mat_idx=1,
        smooth=True,
    )
    arm_r_mesh = _create_multimat_mesh_object("Arm_R_Mesh", bm_armr, collection, [mat_coat, mat_pink])
    arm_r_mesh.parent = arm_r
    arm_r_mesh.location = (0.0, 0.0, 0.0)

    # Professor Cane (child of Arm_R, shaft tip sits strictly at world Z = 0.0 -> local Z = -0.435)
    bm_cane = bmesh.new()
    cane_x, cane_y = hand_r_local.x + 0.015, hand_r_local.y - 0.022
    cane_bot_z = -0.435
    cane_top_z = hand_r_local.z + 0.032
    shaft_len = cane_top_z - (cane_bot_z + 0.030)
    _add_cylinder(
        bm_cane,
        segments=6,
        radius1=0.014,
        radius2=0.016,
        depth=0.030,
        center_xyz=(cane_x, cane_y, cane_bot_z + 0.015),
        mat_idx=1,
        smooth=False,
    )
    _add_cylinder(
        bm_cane,
        segments=6,
        radius1=0.015,
        radius2=0.019,
        depth=shaft_len,
        center_xyz=(cane_x, cane_y, cane_bot_z + 0.030 + shaft_len * 0.5),
        mat_idx=0,
        smooth=True,
    )
    _add_cylinder(
        bm_cane,
        segments=6,
        radius1=0.022,
        radius2=0.024,
        depth=0.022,
        center_xyz=(cane_x, cane_y, cane_top_z + 0.008),
        mat_idx=1,
        smooth=False,
    )
    _add_uvsphere(
        bm_cane,
        u_segments=8,
        v_segments=5,
        radius=0.038,
        center_xyz=(cane_x, cane_y, cane_top_z + 0.044),
        scale_xyz=(1.0, 1.0, 0.92),
        mat_idx=1,
        smooth=True,
    )
    cane_mesh = _create_multimat_mesh_object("Cane", bm_cane, collection, [mat_cane_wood, mat_gold])
    cane_mesh.parent = arm_r
    cane_mesh.location = (0.0, 0.0, 0.0)

    return [
        root,
        body_obj,
        head_empty,
        head_mesh,
        hat_empty,
        hat_mesh,
        arm_l,
        arm_l_mesh,
        arm_r,
        arm_r_mesh,
        cane_mesh,
    ]


# ---------------------------------------------------------------------------
# 2. Adorable Pastel Outdoor Restroom / Toilet (toilet.glb)
# ---------------------------------------------------------------------------

def build_toilet(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build an adorable pastel outdoor candy restroom with crescent-moon door (<= 1,000 tris).

    Fits cleanly on a Ring 0 plot pad (r=0.86m), front door facing -Y (Three.js +Z).
    """
    mat_wall = common.get_or_create_material("toilet_aqua")
    mat_roof = common.get_or_create_material("toilet_roof")
    mat_frosting = common.get_or_create_material("cream_frosting")
    mat_door = common.get_or_create_material("toilet_door")
    mat_biscuit = common.get_or_create_material("cliff_biscuit")
    mat_wood = common.get_or_create_material("wood_wafer")
    mat_window = common.get_or_create_material(
        "window_glow", emission_hex="#FFE380", emission_strength=0.55
    )
    mat_gold = common.get_or_create_material("brass_gold")
    mat_porcelain = common.get_or_create_material("porcelain_white")
    mat_flower = common.get_or_create_material("flower_strawberry")

    # Main booth materials:
    # 0: wall, 1: roof, 2: frosting, 3: biscuit, 4: wood, 5: porcelain, 6: gold, 7: flower
    bm = bmesh.new()

    # 1. Biscuit stone foundation plinth & front welcome step (Z = 0.0 .. 0.08)
    _add_box(bm, (0.86, 0.86, 0.08), (0.0, 0.0, 0.04), mat_idx=3)
    _add_box(bm, (0.50, 0.22, 0.06), (0.0, -0.52, 0.03), mat_idx=3)

    # 2. Cute vertical cabin body with gentle gable peak along Y
    wx, wy = 0.36, 0.36
    z_bot, z_eave, z_peak = 0.08, 0.90, 1.18
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

    for f in (
        bm.faces.new((f_bl, f_br, f_tr, f_pk, f_tl)),
        bm.faces.new((b_br, b_bl, b_tl, b_pk, b_tr)),
        bm.faces.new((b_bl, f_bl, f_tl, b_tl)),
        bm.faces.new((f_br, b_br, b_tr, f_tr)),
        bm.faces.new((f_tl, f_pk, b_pk, b_tl)),
        bm.faces.new((f_pk, f_tr, b_tr, b_pk)),
    ):
        f.material_index = 0
        f.smooth = False

    # Cream frosting corner trim posts & base waist band
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            _add_box(bm, (0.068, 0.068, 0.83), (sx * 0.355, sy * 0.355, 0.495), mat_idx=2)
    _add_box(bm, (0.78, 0.78, 0.045), (0.0, 0.0, 0.105), mat_idx=2)

    # Front doorway frame jambs + lintel
    _add_box(bm, (0.052, 0.06, 0.72), (-0.235, -0.372, 0.44), mat_idx=2)
    _add_box(bm, (0.052, 0.06, 0.72), (0.235, -0.372, 0.44), mat_idx=2)
    _add_box(bm, (0.52, 0.07, 0.058), (0.0, -0.376, 0.81), mat_idx=2)

    # 3. Pastel Lavender Pitched Gable Roof + Cream Frosting Trim
    slope_angle = math.atan2(z_peak - z_eave, wx)
    slope_len = math.hypot(wx + 0.15, (z_peak - z_eave) * ((wx + 0.15) / wx))
    roof_depth = 0.96
    roof_thick = 0.075

    for side_sgn in (-1.0, 1.0):
        mid_x = side_sgn * 0.245
        mid_z = z_peak + 0.036 - 0.245 * math.tan(slope_angle)
        rot_y = side_sgn * slope_angle
        _add_box(
            bm,
            (slope_len, roof_depth, roof_thick),
            (mid_x, 0.0, mid_z),
            mat_idx=1,
            rot_euler=(0.0, rot_y, 0.0),
        )
        for fy_sgn in (-1.0, 1.0):
            _add_box(
                bm,
                (slope_len + 0.02, 0.06, roof_thick + 0.025),
                (mid_x, fy_sgn * (roof_depth * 0.5 - 0.015), mid_z + 0.010),
                mat_idx=2,
                rot_euler=(0.0, rot_y, 0.0),
            )
    _add_box(bm, (0.095, roof_depth + 0.02, 0.080), (0.0, 0.0, z_peak + 0.048), mat_idx=2)

    # 4. Cute Rooftop Porcelain Vent Pipe with Golden Finial Cap
    _add_cylinder(
        bm,
        segments=8,
        radius1=0.055,
        radius2=0.055,
        depth=0.22,
        center_xyz=(0.16, 0.14, 1.18),
        mat_idx=5,
        smooth=True,
    )
    _add_cylinder(
        bm,
        segments=8,
        radius1=0.095,
        radius2=0.022,
        depth=0.07,
        center_xyz=(0.16, 0.14, 1.31),
        mat_idx=6,
        smooth=False,
    )

    # 5. Playful Side Details:
    # Right side (+X): miniature porcelain toilet-paper roll holder!
    _add_box(bm, (0.08, 0.16, 0.03), (0.40, -0.04, 0.56), mat_idx=4)
    _add_cylinder(
        bm,
        segments=10,
        radius1=0.055,
        radius2=0.055,
        depth=0.11,
        center_xyz=(0.425, -0.04, 0.50),
        mat_idx=5,
        rot_euler=(math.radians(90.0), 0.0, 0.0),
        smooth=True,
    )
    _add_box(bm, (0.014, 0.105, 0.11), (0.478, -0.04, 0.445), mat_idx=5)

    # Left side (-X): tiny candy flower box
    _add_box(bm, (0.095, 0.28, 0.08), (-0.41, 0.0, 0.48), mat_idx=4)
    for fy in (-0.08, 0.0, 0.08):
        _add_uvsphere(
            bm,
            u_segments=6,
            v_segments=4,
            radius=0.036,
            center_xyz=(-0.41, fy, 0.538),
            scale_xyz=(1.0, 1.0, 0.85),
            mat_idx=7,
            smooth=True,
        )

    # Tiny gable plaque diamond above doorway
    _add_box(
        bm,
        (0.11, 0.03, 0.11),
        (0.0, -0.375, 0.99),
        mat_idx=6,
        rot_euler=(0.0, math.radians(45.0), 0.0),
    )

    toilet_obj = _create_multimat_mesh_object(
        "toilet",
        bm,
        collection,
        [mat_wall, mat_roof, mat_frosting, mat_biscuit, mat_wood, mat_porcelain, mat_gold, mat_flower],
    )
    toilet_obj.location = (0.0, 0.0, 0.0)
    toilet_obj.rotation_euler = (0.0, 0.0, 0.0)
    toilet_obj.scale = (1.0, 1.0, 1.0)

    # 6. Distinct ToiletDoor child mesh (pivoted at left hinge (-0.21, -0.378, 0.08))
    bm_door = bmesh.new()
    # Materials: 0: door, 1: frosting, 2: window_glow (crescent moon!), 3: gold
    _add_box(bm_door, (0.42, 0.046, 0.70), (0.21, 0.0, 0.35), mat_idx=0)
    _add_box(bm_door, (0.30, 0.022, 0.24), (0.21, -0.026, 0.18), mat_idx=1)

    # Crisp manifold glowing yellow Crescent Moon window on upper door!
    _add_crescent_moon(
        bm_door,
        center_xz=(0.20, 0.515),
        y_front=-0.038,
        y_back=-0.015,
        outer_r=0.112,
        mat_idx=2,
        steps=8,
    )

    # Glossy brass doorknob
    _add_uvsphere(
        bm_door,
        u_segments=8,
        v_segments=5,
        radius=0.028,
        center_xyz=(0.355, -0.040, 0.32),
        scale_xyz=(1.0, 0.85, 1.0),
        mat_idx=3,
        smooth=True,
    )

    door_obj = _create_multimat_mesh_object(
        "ToiletDoor", bm_door, collection, [mat_door, mat_frosting, mat_window, mat_gold]
    )
    door_obj.parent = toilet_obj
    door_obj.location = (-0.21, -0.378, 0.08)

    return [toilet_obj, door_obj]


# ---------------------------------------------------------------------------
# 3. Hamburger Stand (hamburger_stand.glb)
# ---------------------------------------------------------------------------

def build_hamburger_stand(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build the striped candy-awning Hamburger Stand with giant rooftop burger sign (<= 1,500 tris).

    Fits cleanly on a Ring 0 plot pad (r=0.86m), serving counter facing -Y (Three.js +Z).
    """
    mat_wall = common.get_or_create_material("cottage_wall")
    mat_red = common.get_or_create_material("burger_awning_red")
    mat_frosting = common.get_or_create_material("cream_frosting")
    mat_wood = common.get_or_create_material("wood_wafer")
    mat_biscuit = common.get_or_create_material("cliff_biscuit")
    mat_gold = common.get_or_create_material("brass_gold")
    mat_bun = common.get_or_create_material("burger_bun")
    mat_patty = common.get_or_create_material("burger_patty")
    mat_cheese = common.get_or_create_material("burger_cheese")
    mat_lettuce = common.get_or_create_material("burger_lettuce")
    mat_tomato = common.get_or_create_material("burger_tomato")
    mat_porcelain = common.get_or_create_material("porcelain_white")
    mat_plum = common.get_or_create_material("prof_plum")

    stand_mats = [
        mat_wall,
        mat_red,
        mat_frosting,
        mat_wood,
        mat_biscuit,
        mat_gold,
        mat_cheese,
        mat_porcelain,
        mat_plum,
        mat_bun,
        mat_patty,
        mat_lettuce,
    ]
    bm = bmesh.new()

    # 1. Foundation slab (Z = 0.0 .. 0.08)
    _add_box(bm, (1.16, 0.94, 0.08), (0.0, 0.0, 0.04), mat_idx=4)

    # 2. Kiosk lower booth walls (Z = 0.08 .. 0.54)
    _add_box(bm, (1.04, 0.80, 0.46), (0.0, 0.0, 0.31), mat_idx=0)
    _add_box(bm, (1.07, 0.83, 0.095), (0.0, 0.0, 0.155), mat_idx=1)
    _add_box(bm, (1.07, 0.83, 0.055), (0.0, 0.0, 0.455), mat_idx=1)

    # Wide overhanging wafer-wood front serving counter (Z = 0.54 .. 0.595)
    _add_box(bm, (1.18, 0.34, 0.055), (0.0, -0.44, 0.568), mat_idx=3)
    for bx in (-0.42, 0.42):
        _add_box(bm, (0.055, 0.16, 0.09), (bx, -0.46, 0.495), mat_idx=2)

    # 3. Upper kiosk back wall, partial side walls & four sturdy corner posts (Z = 0.54 .. 0.99)
    _add_box(bm, (1.04, 0.08, 0.45), (0.0, 0.36, 0.765), mat_idx=0)
    for sx in (-1.0, 1.0):
        _add_box(bm, (0.075, 0.46, 0.45), (sx * 0.482, 0.16, 0.765), mat_idx=0)
        _add_box(bm, (0.085, 0.085, 0.47), (sx * 0.49, -0.37, 0.775), mat_idx=3)
        _add_box(bm, (0.085, 0.085, 0.47), (sx * 0.49, 0.37, 0.775), mat_idx=3)

    # Miniature menu chalkboard on interior back wall
    _add_box(bm, (0.56, 0.03, 0.24), (0.0, 0.305, 0.79), mat_idx=8)
    _add_box(bm, (0.60, 0.02, 0.28), (0.0, 0.312, 0.79), mat_idx=3)
    for lz, lw in ((0.84, 0.34), (0.78, 0.26), (0.72, 0.30)):
        _add_box(bm, (lw, 0.015, 0.022), (0.0, 0.288, lz), mat_idx=2)

    # 4. Serving Counter Props: Ketchup, Mustard & Mini Burger on a Plate!
    _add_cylinder(bm, 8, 0.032, 0.032, 0.11, (-0.36, -0.47, 0.65), mat_idx=1, smooth=True)
    _add_cylinder(bm, 6, 0.018, 0.006, 0.045, (-0.36, -0.47, 0.725), mat_idx=1, smooth=False)
    _add_cylinder(bm, 8, 0.030, 0.030, 0.105, (-0.27, -0.49, 0.648), mat_idx=6, smooth=True)
    _add_cylinder(bm, 6, 0.016, 0.006, 0.042, (-0.27, -0.49, 0.720), mat_idx=6, smooth=False)
    _add_cylinder(bm, 10, 0.105, 0.085, 0.018, (0.22, -0.46, 0.604), mat_idx=7, smooth=True)
    _add_cylinder(bm, 8, 0.068, 0.068, 0.026, (0.22, -0.46, 0.625), mat_idx=9, smooth=True)
    _add_cylinder(bm, 8, 0.072, 0.072, 0.022, (0.22, -0.46, 0.648), mat_idx=10, smooth=True)
    _add_cylinder(bm, 8, 0.076, 0.076, 0.012, (0.22, -0.46, 0.664), mat_idx=11, smooth=False)
    _add_uvsphere(
        bm, 8, 4, 0.068, (0.22, -0.46, 0.668), (1.0, 1.0, 0.58), mat_idx=9, smooth=True
    )

    # 5. Roof Deck + Cream Frosting Fascia (Z = 0.99 .. 1.09)
    _add_box(bm, (1.16, 0.94, 0.085), (0.0, 0.0, 1.035), mat_idx=2)
    _add_box(bm, (1.12, 0.90, 0.045), (0.0, 0.0, 1.092), mat_idx=1)

    # 6. Striped Candy Awning overhanging the front serving window (-Y)
    n_stripes = 7
    stripe_w = 1.19 / n_stripes
    awning_tilt = math.radians(20.0)
    for i in range(n_stripes):
        sx = -0.595 + (i + 0.5) * stripe_w
        mi = 1 if i % 2 == 0 else 2
        _add_box(
            bm,
            (stripe_w + 0.002, 0.40, 0.048),
            (sx, -0.58, 1.005),
            mat_idx=mi,
            rot_euler=(awning_tilt, 0.0, 0.0),
        )
        # Cute front scalloped valance tab (kept compact so counter props shine clearly!)
        _add_cylinder(
            bm,
            segments=6,
            radius1=stripe_w * 0.43,
            radius2=stripe_w * 0.43,
            depth=0.036,
            center_xyz=(sx, -0.76, 0.920),
            mat_idx=mi,
            rot_euler=(math.radians(90.0), 0.0, 0.0),
            smooth=False,
        )

    # Two brass rooftop struts supporting the Giant Burger Sign
    for sx in (-0.19, 0.19):
        _add_cylinder(
            bm,
            segments=6,
            radius1=0.028,
            radius2=0.028,
            depth=0.14,
            center_xyz=(sx, -0.02, 1.15),
            mat_idx=5,
            smooth=False,
        )

    stand_obj = _create_multimat_mesh_object("hamburger_stand", bm, collection, stand_mats)
    stand_obj.location = (0.0, 0.0, 0.0)
    stand_obj.rotation_euler = (0.0, 0.0, 0.0)
    stand_obj.scale = (1.0, 1.0, 1.0)

    # 7. Giant 3D Rooftop Hamburger Sign child mesh (BurgerSign)
    bm_burger = bmesh.new()
    # Materials: 0: bun, 1: lettuce, 2: patty, 3: cheese, 4: tomato, 5: sesame (cream_frosting)
    _add_cylinder(
        bm_burger,
        segments=14,
        radius1=0.295,
        radius2=0.315,
        depth=0.088,
        center_xyz=(0.0, 0.0, 0.044),
        mat_idx=0,
        smooth=True,
    )
    # Crisp ruffled bright-green lettuce layer
    lettuce_r_outer = 0.348
    lettuce_segs = 14
    l_top_c = bm_burger.verts.new((0.0, 0.0, 0.114))
    l_bot_c = bm_burger.verts.new((0.0, 0.0, 0.086))
    l_top_ring: list[bmesh.types.BMVert] = []
    l_bot_ring: list[bmesh.types.BMVert] = []
    for k in range(lettuce_segs):
        ang = (2.0 * math.pi * k) / lettuce_segs
        wave_r = lettuce_r_outer + 0.028 * math.sin(7.0 * ang)
        wave_z = 0.018 * math.cos(7.0 * ang)
        l_top_ring.append(
            bm_burger.verts.new((wave_r * math.cos(ang), wave_r * math.sin(ang), 0.112 + wave_z))
        )
        l_bot_ring.append(
            bm_burger.verts.new((wave_r * math.cos(ang), wave_r * math.sin(ang), 0.088 + wave_z))
        )
    for k in range(lettuce_segs):
        kn = (k + 1) % lettuce_segs
        for verts in (
            (l_top_c, l_top_ring[k], l_top_ring[kn]),
            (l_bot_c, l_bot_ring[kn], l_bot_ring[k]),
            (l_bot_ring[k], l_bot_ring[kn], l_top_ring[kn], l_top_ring[k]),
        ):
            f = bm_burger.faces.new(verts)
            f.material_index = 1
            f.smooth = False

    _add_cylinder(
        bm_burger,
        segments=14,
        radius1=0.325,
        radius2=0.325,
        depth=0.082,
        center_xyz=(0.0, 0.0, 0.148),
        mat_idx=2,
        smooth=True,
    )
    _add_box(
        bm_burger,
        (0.54, 0.54, 0.026),
        (0.0, 0.0, 0.198),
        mat_idx=3,
        rot_euler=(0.0, 0.0, math.radians(32.0)),
        smooth=False,
    )
    for tx, ty in ((-0.12, -0.14), (0.14, -0.11), (0.0, 0.12)):
        _add_cylinder(
            bm_burger,
            segments=10,
            radius1=0.165,
            radius2=0.165,
            depth=0.032,
            center_xyz=(tx, ty, 0.222),
            mat_idx=4,
            smooth=True,
        )
    ret_top = bmesh.ops.create_uvsphere(bm_burger, u_segments=14, v_segments=8, radius=1.0)
    for v in ret_top["verts"]:
        if v.co.z < 0.0:
            v.co.z *= 0.18
        v.co.x *= 0.325
        v.co.y *= 0.325
        v.co.z = 0.238 + v.co.z * 0.175
    for v in ret_top["verts"]:
        for f in v.link_faces:
            f.material_index = 0
            f.smooth = True

    seed_positions = [
        (0.0, 0.0, 0.415, 0.0),
        (-0.12, -0.11, 0.382, 0.4),
        (0.13, -0.10, 0.382, -0.5),
        (-0.16, 0.06, 0.372, 1.1),
        (0.15, 0.09, 0.372, -1.0),
        (0.0, -0.18, 0.362, 0.0),
        (0.02, 0.17, 0.366, 0.6),
    ]
    for sx, sy, sz, rot_z in seed_positions:
        _add_uvsphere(
            bm_burger,
            u_segments=5,
            v_segments=3,
            radius=0.024,
            center_xyz=(sx, sy, sz),
            scale_xyz=(1.35, 0.72, 0.55),
            mat_idx=5,
            rot_euler=(0.0, 0.0, rot_z),
            smooth=True,
        )

    burger_sign = _create_multimat_mesh_object(
        "BurgerSign",
        bm_burger,
        collection,
        [mat_bun, mat_lettuce, mat_patty, mat_cheese, mat_tomato, mat_frosting],
    )
    burger_sign.parent = stand_obj
    burger_sign.location = (0.0, -0.02, 1.19)

    return [stand_obj, burger_sign]


# ---------------------------------------------------------------------------
# 4. Glossy Jelly Coin (jelly_coin.glb)
# ---------------------------------------------------------------------------

def build_jelly_coin(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build a glossy gold Jelly Coin stamped with a raised jelly bean emblem (<= 400 tris)."""
    mat_gold = common.get_or_create_material("coin_gold")
    mat_rim = common.get_or_create_material("coin_gold_rim")
    mat_stamp = common.get_or_create_material("jelly_cherry")

    bm = bmesh.new()
    radius = 0.18
    segs = 14

    # Single-lathe stepped coin profile (front face -Y to back face +Y):
    # (y_offset, ring_radius, mat_idx_of_band_after)
    # Creates a chunky raised rim lip + recessed gleaming gold inner field with ~180 tris total!
    profile = [
        (-0.022, radius * 0.78),  # 0: front inner recessed face
        (-0.036, radius * 0.84),  # 1: front rim inner bevel
        (-0.036, radius * 0.96),  # 2: front rim ridge
        (-0.022, radius * 1.00),  # 3: front outer edge
        (0.022, radius * 1.00),   # 4: back outer edge
        (0.036, radius * 0.96),   # 5: back rim ridge
        (0.036, radius * 0.84),   # 6: back rim inner bevel
        (0.022, radius * 0.78),   # 7: back inner recessed face
    ]
    rings: list[list[bmesh.types.BMVert]] = []
    for y_off, r_ring in profile:
        ring: list[bmesh.types.BMVert] = []
        for s in range(segs):
            ang = (2.0 * math.pi * s) / segs
            ring.append(bm.verts.new((r_ring * math.cos(ang), y_off, radius + r_ring * math.sin(ang))))
        rings.append(ring)

    # Front & back recessed gold center discs (slot 0: bright coin_gold)
    front_c = bm.verts.new((0.0, -0.022, radius))
    back_c = bm.verts.new((0.0, 0.022, radius))
    for s in range(segs):
        sn = (s + 1) % segs
        f_f = bm.faces.new((front_c, rings[0][sn], rings[0][s]))
        f_f.material_index = 0
        f_f.smooth = False
        f_b = bm.faces.new((back_c, rings[-1][s], rings[-1][sn]))
        f_b.material_index = 0
        f_b.smooth = False

    # Connect lathe bands (slot 1: rich warm coin_gold_rim)
    for b_idx in range(len(profile) - 1):
        ra = rings[b_idx]
        rb = rings[b_idx + 1]
        for s in range(segs):
            sn = (s + 1) % segs
            f = bm.faces.new((ra[s], ra[sn], rb[sn], rb[s]))
            f.material_index = 1
            f.smooth = b_idx in (1, 2, 3, 4, 5)

    # Raised embossed glossy cherry jelly bean stamped proudly on front (-Y) & back (+Y)
    for y_sgn in (-1.0, 1.0):
        ret_bean = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=5, radius=1.0)
        for v in ret_bean["verts"]:
            x, y, z = v.co.x, v.co.y, v.co.z
            curve_x = -0.020 * (z * z) + 0.008
            bx = x * 0.068 + curve_x
            bz = z * 0.105
            by = y * 0.020
            ang = math.radians(-18.0)
            rx = bx * math.cos(ang) - bz * math.sin(ang)
            rz = bx * math.sin(ang) + bz * math.cos(ang)
            v.co = Vector((rx, y_sgn * 0.024 + by, radius + rz))
        for v in ret_bean["verts"]:
            for f in v.link_faces:
                f.material_index = 2
                f.smooth = True

    coin_obj = _create_multimat_mesh_object("jelly_coin", bm, collection, [mat_gold, mat_rim, mat_stamp])
    common.normalize_origin_to_base(coin_obj, center_xy=True, target_z=0.0)
    return [coin_obj]


# ---------------------------------------------------------------------------
# 5. Crisp Emerald Bean Buck (bean_buck.glb)
# ---------------------------------------------------------------------------

def build_bean_buck(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build a crisp emerald-green candy banknote with a smiling bean medallion (<= 400 tris)."""
    mat_emerald = common.get_or_create_material("buck_emerald")
    mat_mint = common.get_or_create_material("buck_mint")
    mat_cream = common.get_or_create_material("cream_frosting")
    mat_lime = common.get_or_create_material("jelly_lime")
    mat_gold = common.get_or_create_material("coin_gold")
    mat_eye = common.get_or_create_material("eye_licorice")

    bm = bmesh.new()
    bill_w, bill_h, bill_t = 0.46, 0.28, 0.026
    cz = bill_h * 0.5

    # Crisp emerald banknote body (clean flat-beveled bill so medallion & border never clip!)
    _add_box(bm, (bill_w, bill_t, bill_h), (0.0, 0.0, cz), mat_idx=0)

    # Crisp mint-green ornamental inner border frame on front (-Y)
    for sx in (-0.19, 0.19):
        _add_box(bm, (0.022, 0.012, 0.205), (sx, -bill_t * 0.52, cz), mat_idx=1)
    for sz in (0.040, bill_h - 0.040):
        _add_box(bm, (0.39, 0.012, 0.022), (0.0, -bill_t * 0.52, sz), mat_idx=1)

    # Four golden corner seal pips
    for sx in (-0.188, 0.188):
        for sz in (0.044, bill_h - 0.044):
            _add_cylinder(
                bm,
                segments=6,
                radius1=0.024,
                radius2=0.024,
                depth=0.018,
                center_xyz=(sx, -bill_t * 0.56, sz),
                mat_idx=4,
                rot_euler=(math.radians(90.0), 0.0, 0.0),
                smooth=False,
            )

    # Central cream oval medallion proud on front & back
    _add_cylinder(
        bm,
        segments=12,
        radius1=0.108,
        radius2=0.108,
        depth=bill_t + 0.018,
        center_xyz=(0.0, 0.0, cz),
        mat_idx=2,
        rot_euler=(math.radians(90.0), 0.0, 0.0),
        smooth=True,
    )

    # Cute smiling lime-green Jelly Bean portrait embossed on the front medallion!
    ret_bean = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=5, radius=1.0)
    for v in ret_bean["verts"]:
        x, y, z = v.co.x, v.co.y, v.co.z
        curve_x = -0.014 * (z * z) + 0.006
        v.co = Vector((x * 0.062 + curve_x, -0.024 + y * 0.020, cz + z * 0.084))
    for v in ret_bean["verts"]:
        for f in v.link_faces:
            f.material_index = 3
            f.smooth = True

    # Two cheerful dark-licorice eyes
    for ex in (-0.020, 0.024):
        _add_uvsphere(
            bm,
            u_segments=6,
            v_segments=3,
            radius=0.012,
            center_xyz=(ex, -0.042, cz + 0.018),
            scale_xyz=(1.0, 0.65, 1.1),
            mat_idx=5,
            smooth=True,
        )
    # Happy curved U-shaped smile (3 crisp angled segments!)
    _add_box(bm, (0.022, 0.010, 0.010), (0.002, -0.044, cz - 0.024), mat_idx=5)
    _add_box(
        bm,
        (0.018, 0.010, 0.010),
        (-0.016, -0.042, cz - 0.016),
        mat_idx=5,
        rot_euler=(0.0, math.radians(38.0), 0.0),
    )
    _add_box(
        bm,
        (0.018, 0.010, 0.010),
        (0.020, -0.042, cz - 0.016),
        mat_idx=5,
        rot_euler=(0.0, math.radians(-38.0), 0.0),
    )

    buck_obj = _create_multimat_mesh_object(
        "bean_buck",
        bm,
        collection,
        [mat_emerald, mat_mint, mat_cream, mat_lime, mat_gold, mat_eye],
    )
    common.normalize_origin_to_base(buck_obj, center_xy=True, target_z=0.0)
    return [buck_obj]


# ---------------------------------------------------------------------------
# 6. Iridescent Rainbow Bonus Bean (bonus_bean.glb)
# ---------------------------------------------------------------------------

def build_bonus_bean(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build an iridescent rainbow glossy Bonus Bean token with sparkle diamonds (<= 400 tris)."""
    rainbow_mats = [
        common.get_or_create_material("jelly_cherry"),    # 0: bottom-most band
        common.get_or_create_material("jelly_gold"),      # 1: warm gold band & sparkles
        common.get_or_create_material("jelly_lime"),      # 2: mint-lime center band
        common.get_or_create_material("jelly_berry"),     # 3: sky-blue band
        common.get_or_create_material("jelly_lavender"),  # 4: top lavender band
    ]

    bm = bmesh.new()

    # Smooth plump kidney-bean silhouette (16x10 UV sphere -> 288 tris)
    ret = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    for v in ret["verts"]:
        x, y, z = v.co.x, v.co.y, v.co.z
        curve_x = -0.042 * (z * z) + 0.018
        pinch = 1.0 - 0.14 * math.exp(-((z * 2.1) ** 2)) * (1.0 if x > 0 else 0.2)
        v.co = Vector((x * 0.122 * pinch + curve_x, y * 0.112, z * 0.185))

    # Paint 5 balanced rainbow candy stripes using arcsin latitude angle so all 5 bands are even!
    for v in ret["verts"]:
        for f in v.link_faces:
            cz = f.calc_center_median().z
            norm_z = max(-1.0, min(1.0, cz / 0.185))
            # Latitude parameter u in [0..1]
            u = (math.asin(norm_z) / math.pi) + 0.5
            band = min(4, max(0, int(u * 5.0)))
            f.material_index = band
            f.smooth = True

    bmesh.ops.rotate(
        bm,
        cent=(0.0, 0.0, 0.0),
        matrix=Euler((0.0, math.radians(-12.0), 0.0), "XYZ").to_matrix(),
        verts=list(bm.verts),
    )

    min_z = min(v.co.z for v in bm.verts)
    for v in bm.verts:
        v.co.z -= min_z

    # Three gleaming floating golden diamond sparkles flanking the rainbow bean (24 tris total)
    sparkle_specs = [
        ((-0.175, -0.02, 0.295), 0.038),
        ((0.172, -0.02, 0.235), 0.030),
        ((0.135, -0.04, 0.085), 0.024),
    ]
    for (sx, sy, sz), rad in sparkle_specs:
        v_top = bm.verts.new((sx, sy, sz + rad * 1.35))
        v_bot = bm.verts.new((sx, sy, sz - rad * 1.35))
        v_ring = [
            bm.verts.new((sx + rad, sy, sz)),
            bm.verts.new((sx, sy + rad * 0.65, sz)),
            bm.verts.new((sx - rad, sy, sz)),
            bm.verts.new((sx, sy - rad * 0.65, sz)),
        ]
        for k in range(4):
            kn = (k + 1) % 4
            for tri in ((v_top, v_ring[k], v_ring[kn]), (v_bot, v_ring[kn], v_ring[k])):
                f = bm.faces.new(tri)
                f.material_index = 1
                f.smooth = False

    bonus_obj = _create_multimat_mesh_object("bonus_bean", bm, collection, rainbow_mats)
    common.normalize_origin_to_base(bonus_obj, center_xy=True, target_z=0.0)
    return [bonus_obj]


# ---------------------------------------------------------------------------
# Main Build Entrypoint
# ---------------------------------------------------------------------------

def main() -> dict[str, object]:
    common.ensure_dirs()
    common.reset_scene()

    dr_coll = common.ensure_collection("DrBubblegum")
    toilet_coll = common.ensure_collection("Toilet")
    stand_coll = common.ensure_collection("HamburgerStand")
    coin_coll = common.ensure_collection("JellyCoin")
    buck_coll = common.ensure_collection("BeanBuck")
    bonus_coll = common.ensure_collection("BonusBean")
    studio_coll = common.ensure_collection("Studio")

    dr_objs = build_dr_bubblegum(dr_coll)
    toilet_objs = build_toilet(toilet_coll)
    stand_objs = build_hamburger_stand(stand_coll)
    coin_objs = build_jelly_coin(coin_coll)
    buck_objs = build_bean_buck(buck_coll)
    bonus_objs = build_bonus_bean(bonus_coll)

    # Studio lights & default preview camera framing Dr. Bubblegum
    common.setup_world_lighting("#D7F3FF", strength=0.65)
    common.setup_studio_lights(studio_coll)

    cam_data = bpy.data.cameras.new("PreviewCamera")
    cam_data.lens = 50.0
    cam_obj = bpy.data.objects.new("PreviewCamera", cam_data)
    cam_obj.location = (0.78, -2.05, 0.92)
    studio_coll.objects.link(cam_obj)
    common.point_camera_at(cam_obj, Vector((0.0, 0.0, 0.54)))
    bpy.context.scene.camera = cam_obj

    # 1. Export all 6 GLBs (each strictly at origin (0,0,0), scale (1,1,1))
    dr_glb = common.export_glb(dr_objs, common.PUBLIC_MODELS_DIR / "dr_bubblegum.glb")
    toilet_glb = common.export_glb(toilet_objs, common.PUBLIC_MODELS_DIR / "toilet.glb")
    stand_glb = common.export_glb(stand_objs, common.PUBLIC_MODELS_DIR / "hamburger_stand.glb")
    coin_glb = common.export_glb(coin_objs, common.PUBLIC_MODELS_DIR / "jelly_coin.glb")
    buck_glb = common.export_glb(buck_objs, common.PUBLIC_MODELS_DIR / "bean_buck.glb")
    bonus_glb = common.export_glb(bonus_objs, common.PUBLIC_MODELS_DIR / "bonus_bean.glb")

    # 2. Render 128x128 transparent RGBA studio PNG HUD icons
    # Dr. Bubblegum portrait icon: crisp bust framing head, gold spectacles, mortarboard,
    # bowtie & marshmallow heart lapel pin so it reads clearly even at 64x64 on mobile!
    dr_icon = common.render_icon_png(
        dr_objs,
        common.PUBLIC_ICONS_DIR / "dr_bubblegum.png",
        size=128,
        transparent=True,
        cam_azimuth_deg=14.0,
        cam_elevation_deg=8.0,
        ortho=True,
        margin=1.18,
        samples=32,
        center_override=(0.02, -0.02, 0.69),
        extent_override=0.64,
    )
    toilet_icon = common.render_icon_png(
        toilet_objs,
        common.PUBLIC_ICONS_DIR / "toilet.png",
        size=128,
        transparent=True,
        cam_azimuth_deg=26.0,
        cam_elevation_deg=16.0,
        ortho=True,
        margin=1.22,
        samples=32,
    )
    stand_icon = common.render_icon_png(
        stand_objs,
        common.PUBLIC_ICONS_DIR / "hamburger_stand.png",
        size=128,
        transparent=True,
        cam_azimuth_deg=24.0,
        cam_elevation_deg=16.0,
        ortho=True,
        margin=1.24,
        samples=32,
    )
    coin_icon = common.render_icon_png(
        coin_objs,
        common.PUBLIC_ICONS_DIR / "jelly_coin.png",
        size=128,
        transparent=True,
        cam_azimuth_deg=18.0,
        cam_elevation_deg=10.0,
        ortho=True,
        margin=1.18,
        samples=32,
    )
    buck_icon = common.render_icon_png(
        buck_objs,
        common.PUBLIC_ICONS_DIR / "bean_buck.png",
        size=128,
        transparent=True,
        cam_azimuth_deg=14.0,
        cam_elevation_deg=10.0,
        ortho=True,
        margin=1.18,
        samples=32,
    )
    bonus_icon = common.render_icon_png(
        bonus_objs,
        common.PUBLIC_ICONS_DIR / "bonus_bean.png",
        size=128,
        transparent=True,
        cam_azimuth_deg=16.0,
        cam_elevation_deg=12.0,
        ortho=True,
        margin=1.20,
        samples=32,
    )

    # 3. Render 512x512 verification thumbnails for visual silhouette inspection
    thumb_dr = common.render_icon_png(
        dr_objs,
        common.THUMBNAIL_DIR / "dr_bubblegum_thumb.png",
        size=512,
        transparent=False,
        bg_hex="#D7F3FF",
        cam_azimuth_deg=20.0,
        cam_elevation_deg=12.0,
        ortho=False,
        margin=1.30,
        samples=24,
    )
    thumb_toilet = common.render_icon_png(
        toilet_objs,
        common.THUMBNAIL_DIR / "toilet_thumb.png",
        size=512,
        transparent=False,
        bg_hex="#D7F3FF",
        cam_azimuth_deg=28.0,
        cam_elevation_deg=18.0,
        ortho=False,
        margin=1.34,
        samples=24,
    )
    thumb_stand = common.render_icon_png(
        stand_objs,
        common.THUMBNAIL_DIR / "hamburger_stand_thumb.png",
        size=512,
        transparent=False,
        bg_hex="#D7F3FF",
        cam_azimuth_deg=26.0,
        cam_elevation_deg=18.0,
        ortho=False,
        margin=1.36,
        samples=24,
    )
    thumb_coin = common.render_icon_png(
        coin_objs,
        common.THUMBNAIL_DIR / "jelly_coin_thumb.png",
        size=512,
        transparent=False,
        bg_hex="#D7F3FF",
        cam_azimuth_deg=22.0,
        cam_elevation_deg=12.0,
        ortho=False,
        margin=1.26,
        samples=24,
    )
    thumb_buck = common.render_icon_png(
        buck_objs,
        common.THUMBNAIL_DIR / "bean_buck_thumb.png",
        size=512,
        transparent=False,
        bg_hex="#D7F3FF",
        cam_azimuth_deg=18.0,
        cam_elevation_deg=12.0,
        ortho=False,
        margin=1.26,
        samples=24,
    )
    thumb_bonus = common.render_icon_png(
        bonus_objs,
        common.THUMBNAIL_DIR / "bonus_bean_thumb.png",
        size=512,
        transparent=False,
        bg_hex="#D7F3FF",
        cam_azimuth_deg=18.0,
        cam_elevation_deg=12.0,
        ortho=False,
        margin=1.28,
        samples=24,
    )

    # Keep Dr. Bubblegum visible in default viewport (hide other assets overlapping at origin)
    common.setup_world_lighting("#D7F3FF", strength=0.65)
    for obj in (*toilet_objs, *stand_objs, *coin_objs, *buck_objs, *bonus_objs):
        obj.hide_viewport = True
        obj.hide_render = True
    for obj in dr_objs:
        obj.hide_viewport = False
        obj.hide_render = False
    bpy.context.view_layer.objects.active = dr_objs[0]

    # 4. Save clean source .blend file
    blend_path = common.BLEND_DIR / "village_m2.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    # 5. Assert PR-08 & DESIGN.md triangle, size, and origin budgets
    assert dr_glb["triangles"] <= 2000, f"Dr. Bubblegum tris {dr_glb['triangles']} > 2000"
    assert dr_glb["size_bytes"] <= 75 * 1024, f"Dr. Bubblegum size {dr_glb['size_bytes']} > 75 KB"
    assert toilet_glb["triangles"] <= 1000, f"Toilet tris {toilet_glb['triangles']} > 1000"
    assert toilet_glb["size_bytes"] <= 65 * 1024, f"Toilet size {toilet_glb['size_bytes']} > 65 KB"
    assert stand_glb["triangles"] <= 1500, f"Hamburger Stand tris {stand_glb['triangles']} > 1500"
    assert stand_glb["size_bytes"] <= 65 * 1024, f"Hamburger Stand size {stand_glb['size_bytes']} > 65 KB"
    for label, report in (
        ("jelly_coin", coin_glb),
        ("bean_buck", buck_glb),
        ("bonus_bean", bonus_glb),
    ):
        assert report["triangles"] <= 400, f"{label} tris {report['triangles']} > 400"
        assert report["size_bytes"] <= 20 * 1024, f"{label} size {report['size_bytes']} > 20 KB"

    for root_obj in (
        dr_objs[0],
        toilet_objs[0],
        stand_objs[0],
        coin_objs[0],
        buck_objs[0],
        bonus_objs[0],
    ):
        assert tuple(round(c, 5) for c in root_obj.location) == (0.0, 0.0, 0.0), (
            f"{root_obj.name} origin not (0,0,0): {tuple(root_obj.location)}"
        )
        assert tuple(round(c, 5) for c in root_obj.scale) == (1.0, 1.0, 1.0), (
            f"{root_obj.name} scale not (1,1,1): {tuple(root_obj.scale)}"
        )

    return {
        "blend_path": str(blend_path),
        "models": {
            "dr_bubblegum": dr_glb,
            "toilet": toilet_glb,
            "hamburger_stand": stand_glb,
            "jelly_coin": coin_glb,
            "bean_buck": buck_glb,
            "bonus_bean": bonus_glb,
        },
        "icons": {
            "dr_bubblegum": dr_icon,
            "toilet": toilet_icon,
            "hamburger_stand": stand_icon,
            "jelly_coin": coin_icon,
            "bean_buck": buck_icon,
            "bonus_bean": bonus_icon,
        },
        "thumbnails": {
            "dr_bubblegum": thumb_dr,
            "toilet": thumb_toilet,
            "hamburger_stand": thumb_stand,
            "jelly_coin": thumb_coin,
            "bean_buck": thumb_buck,
            "bonus_bean": thumb_bonus,
        },
    }


if __name__ == "__main__":
    summary = main()
    print(summary)
