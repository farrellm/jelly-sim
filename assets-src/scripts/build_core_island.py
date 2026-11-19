"""Build PR-02 Core Starter Island (island_ring0.glb) and Glossy App Icons.

Can be executed inside Blender MCP (`execute_blender_code`) or headless via:
    blender --background --python assets-src/scripts/build_core_island.py
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
# Ring 0 Starter Island Builder
# ---------------------------------------------------------------------------

def _organic_radius_factor(angle: float, amp: float = 0.022) -> float:
    """Gentle deterministic sinusoidal undulation for a handcrafted clay silhouette."""
    return (
        1.0
        + amp * math.sin(3.0 * angle + 0.4)
        + (amp * 0.55) * math.cos(5.0 * angle - 0.8)
    )


def _build_island_terrain_mesh(collection: bpy.types.Collection) -> bpy.types.Object:
    """Create the floating pastel candy-grass plateau + gingerbread cliff underside."""
    bm = bmesh.new()

    segs = 24
    # Vertical profile rings: (radius, z, undulation_amp, material_slot_index)
    # Material slots:
    #   0: grass_mint (top plateau)
    #   1: grass_rim (rounded candy-grass overhang lip)
    #   2: cliff_biscuit (upper wafer-clay cliff)
    #   3: cliff_caramel (lower tapered floating rock)
    ring_specs = [
        (common.RING0_TOP_RADIUS * 0.62, 0.0, 0.008),
        (common.RING0_TOP_RADIUS, 0.0, 0.016),
        (common.RING0_OUTER_RADIUS - 0.12, -0.09, 0.022),
        (common.RING0_OUTER_RADIUS, -0.25, 0.025),
        (common.RING0_OUTER_RADIUS - 0.14, -0.44, 0.028),
        (common.RING0_TOP_RADIUS - 0.08, -0.92, 0.042),
        (3.45, -1.48, 0.060),
        (2.05, -2.02, 0.072),
        (0.75, -2.38, 0.048),
    ]

    rings: list[list[bmesh.types.BMVert]] = []
    for r_idx, (radius, z_val, amp) in enumerate(ring_specs):
        ring_verts: list[bmesh.types.BMVert] = []
        for s in range(segs):
            angle = (2.0 * math.pi * s) / segs
            f = _organic_radius_factor(angle, amp=amp)
            # Add gentle vertical wave on the lower cliff bands only
            z_jitter = 0.0
            if r_idx >= 4 and r_idx < len(ring_specs) - 1:
                z_jitter = 0.055 * math.sin(4.0 * angle + r_idx * 1.1)
            x = radius * f * math.cos(angle)
            y = radius * f * math.sin(angle)
            ring_verts.append(bm.verts.new((x, y, z_val + z_jitter)))
        rings.append(ring_verts)

    top_center = bm.verts.new((0.0, 0.0, 0.0))
    bot_center = bm.verts.new((0.0, 0.0, -2.46))

    # Top inner fan -> grass_mint (slot 0)
    for s in range(segs):
        s_next = (s + 1) % segs
        face = bm.faces.new((top_center, rings[0][s], rings[0][s_next]))
        face.material_index = 0

    # Connect concentric rings
    band_materials = [
        0,  # ring 0 -> 1: flat grass plateau
        1,  # ring 1 -> 2: upper grass bevel
        1,  # ring 2 -> 3: outer grass lip
        1,  # ring 3 -> 4: grass overhang underside
        2,  # ring 4 -> 5: upper biscuit cliff
        2,  # ring 5 -> 6: mid biscuit cliff
        3,  # ring 6 -> 7: caramel lower rock
        3,  # ring 7 -> 8: tapered floating tip
    ]

    for r_idx, mat_idx in enumerate(band_materials):
        r_a = rings[r_idx]
        r_b = rings[r_idx + 1]
        for s in range(segs):
            s_next = (s + 1) % segs
            face = bm.faces.new((r_a[s], r_b[s], r_b[s_next], r_a[s_next]))
            face.material_index = mat_idx

    # Bottom cap -> cliff_caramel (slot 3)
    last_ring = rings[-1]
    for s in range(segs):
        s_next = (s + 1) % segs
        face = bm.faces.new((bot_center, last_ring[s_next], last_ring[s]))
        face.material_index = 3

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("island_ring0_base")
    bm.to_mesh(mesh)
    bm.free()

    # Smooth the rounded candy grass lip, keep cliff faces crisply faceted for toyetic clay charm
    for poly in mesh.polygons:
        poly.use_smooth = poly.material_index in (0, 1)
    mesh.update()

    obj = bpy.data.objects.new("island_ring0_base", mesh)
    collection.objects.link(obj)
    for mat_name in ("grass_mint", "grass_rim", "cliff_biscuit", "cliff_caramel"):
        obj.data.materials.append(common.get_or_create_material(mat_name))

    return obj


def _build_shoreline_rocks(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Place charming low-poly shoreline pebbles around the island's outer rim."""
    rocks: list[bpy.types.Object] = []
    # (angle_deg, radius, z, scale_xyz, rot_z_deg, mat_name)
    rock_specs = [
        (18.0, 4.42, -0.10, (0.42, 0.34, 0.24), 15.0, "rock_lavender"),
        (26.0, 4.55, -0.18, (0.24, 0.20, 0.16), 50.0, "sand_cream"),
        (74.0, 4.46, -0.12, (0.36, 0.30, 0.22), 110.0, "rock_slate"),
        (132.0, 4.40, -0.09, (0.44, 0.32, 0.25), 35.0, "rock_lavender"),
        (141.0, 4.56, -0.17, (0.22, 0.20, 0.15), 80.0, "rock_slate"),
        (196.0, 4.44, -0.11, (0.38, 0.30, 0.23), 210.0, "sand_cream"),
        (248.0, 4.45, -0.10, (0.40, 0.32, 0.24), 145.0, "rock_lavender"),
        (304.0, 4.42, -0.11, (0.38, 0.29, 0.22), 62.0, "rock_slate"),
        (314.0, 4.56, -0.17, (0.23, 0.18, 0.15), 125.0, "sand_cream"),
    ]

    for idx, (ang_deg, rad, z_pos, scale, rot_z, mat_name) in enumerate(rock_specs):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
        # Flatten bottom slightly and apply deterministic pebble scale
        for v in bm.verts:
            if v.co.z < -0.25:
                v.co.z = -0.25 + (v.co.z + 0.25) * 0.45
        ang = math.radians(ang_deg)
        x = rad * math.cos(ang)
        y = rad * math.sin(ang)
        xform = (
            Matrix.Translation((x, y, z_pos))
            @ Matrix.Rotation(math.radians(rot_z), 4, "Z")
            @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
        )
        bmesh.ops.transform(bm, matrix=xform, verts=bm.verts)
        rock_obj = common.create_mesh_object(
            f"_shore_rock_{idx}",
            bm,
            collection,
            material=common.get_or_create_material(mat_name),
            smooth=False,
        )
        rocks.append(rock_obj)
    return rocks


def _build_meadow_accents(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Add tiny pastel candy flowers and grass tufts in the 6 outer rim pockets."""
    accents: list[bpy.types.Object] = []
    flower_colors = [
        "flower_strawberry",
        "flower_lemon",
        "flower_lavender",
        "flower_strawberry",
        "flower_lemon",
        "flower_lavender",
    ]

    # Pockets sit at 0, 60, 120, 180, 240, 300 deg — right between the 6 outer plot pads!
    for i in range(6):
        ang = math.radians(i * 60.0)
        fx = 3.68 * math.cos(ang)
        fy = 3.68 * math.sin(ang)

        # Cute 5-petal low-poly candy blossom
        bm_flower = bmesh.new()
        mat_petal = common.get_or_create_material(flower_colors[i])
        mat_center = common.get_or_create_material("flower_center")
        mat_tuft = common.get_or_create_material("grass_tuft")

        # 3 tiny grass blades around the flower
        for b_idx in range(3):
            b_ang = ang + math.radians(b_idx * 120.0 + 25.0)
            bx = fx + 0.22 * math.cos(b_ang)
            by = fy + 0.22 * math.sin(b_ang)
            ret = bmesh.ops.create_cone(
                bm_flower,
                cap_ends=True,
                cap_tris=False,
                segments=4,
                radius1=0.065,
                radius2=0.005,
                depth=0.22,
                matrix=(
                    Matrix.Translation((bx, by, 0.10))
                    @ Matrix.Rotation(b_ang, 4, "Z")
                    @ Matrix.Rotation(math.radians(16.0), 4, "Y")
                ),
            )
            for v in ret["verts"]:
                for f in v.link_faces:
                    f.material_index = 2

        # 5 plump low-poly candy petals (compact 6-sided diamond cushions)
        for p_idx in range(5):
            p_ang = math.radians(p_idx * 72.0 + i * 19.0)
            px = fx + 0.115 * math.cos(p_ang)
            py = fy + 0.115 * math.sin(p_ang)
            ret = bmesh.ops.create_cone(
                bm_flower,
                cap_ends=True,
                cap_tris=False,
                segments=5,
                radius1=0.075,
                radius2=0.055,
                depth=0.055,
                matrix=Matrix.Translation((px, py, 0.075)),
            )
            for v in ret["verts"]:
                for f in v.link_faces:
                    f.material_index = 0

        # Flower center button
        ret = bmesh.ops.create_cone(
            bm_flower,
            cap_ends=True,
            cap_tris=False,
            segments=6,
            radius1=0.062,
            radius2=0.048,
            depth=0.065,
            matrix=Matrix.Translation((fx, fy, 0.095)),
        )
        for v in ret["verts"]:
            for f in v.link_faces:
                f.material_index = 1

        bmesh.ops.recalc_face_normals(bm_flower, faces=bm_flower.faces)
        mesh = bpy.data.meshes.new(f"_meadow_accent_{i}")
        bm_flower.to_mesh(mesh)
        bm_flower.free()
        for poly in mesh.polygons:
            poly.use_smooth = poly.material_index in (0, 1)
        mesh.update()

        obj = bpy.data.objects.new(f"_meadow_accent_{i}", mesh)
        collection.objects.link(obj)
        obj.data.materials.append(mat_petal)
        obj.data.materials.append(mat_center)
        obj.data.materials.append(mat_tuft)
        accents.append(obj)

    return accents


def _build_plot_pad(
    name: str,
    x: float,
    y: float,
    collection: bpy.types.Collection,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    """Create a clean, raycastable rounded-tile plot pad at (x, y, 0.0)."""
    bm = bmesh.new()
    segs = 12
    r_outer = common.RING0_PAD_RADIUS
    r_inner = common.RING0_PAD_RADIUS - 0.11
    h_rim = 0.032
    h_soil = 0.026

    # Outer base ring (Z=0), outer top rim (Z=h_rim), inner rim (Z=h_rim), inner soil (Z=h_soil)
    outer_bot = []
    outer_top = []
    inner_top = []
    for s in range(segs):
        ang = (2.0 * math.pi * s) / segs + math.radians(15.0)
        ca, sa = math.cos(ang), math.sin(ang)
        outer_bot.append(bm.verts.new((r_outer * ca, r_outer * sa, 0.0)))
        outer_top.append(bm.verts.new(((r_outer - 0.03) * ca, (r_outer - 0.03) * sa, h_rim)))
        inner_top.append(bm.verts.new((r_inner * ca, r_inner * sa, h_soil)))

    soil_center = bm.verts.new((0.0, 0.0, h_soil))

    for s in range(segs):
        s_next = (s + 1) % segs
        # Side wall -> pad_trim (slot 0)
        f_side = bm.faces.new((outer_bot[s], outer_bot[s_next], outer_top[s_next], outer_top[s]))
        f_side.material_index = 0
        # Top trim collar -> pad_trim (slot 0)
        f_collar = bm.faces.new((outer_top[s], outer_top[s_next], inner_top[s_next], inner_top[s]))
        f_collar.material_index = 0
        # Inner soil surface -> pad_soil (slot 1)
        f_soil = bm.faces.new((soil_center, inner_top[s], inner_top[s_next]))
        f_soil.material_index = 1

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False
    mesh.update()

    pad_obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(pad_obj)
    pad_obj.data.materials.append(common.get_or_create_material("pad_trim"))
    pad_obj.data.materials.append(common.get_or_create_material("pad_soil"))
    pad_obj.parent = parent
    pad_obj.location = (x, y, common.ISLAND_SURFACE_Z)
    pad_obj.rotation_euler = (0.0, 0.0, 0.0)
    pad_obj.scale = (1.0, 1.0, 1.0)
    return pad_obj


def build_island_ring0(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Assemble island_ring0 and its 7 child plot pads."""
    terrain = _build_island_terrain_mesh(collection)
    rocks = _build_shoreline_rocks(collection)
    accents = _build_meadow_accents(collection)

    island_root = common.join_mesh_objects(
        [terrain, *rocks, *accents],
        name="island_ring0",
        collection=collection,
    )
    common.normalize_terrain_origin(island_root)

    pads = [
        _build_plot_pad(pad_name, px, py, collection, island_root)
        for pad_name, px, py in common.RING0_PLOT_PADS
    ]
    return [island_root, *pads]


# ---------------------------------------------------------------------------
# Studio Glossy Jelly Bean App Icon Subject (512x512 & 180x180)
# ---------------------------------------------------------------------------

def build_app_icon_subject(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Build a glossy hero Jelly Bean diorama subject for the iOS / PWA app icon."""
    created: list[bpy.types.Object] = []

    # 1. Curved glossy cherry-red Jelly Bean body (high-smoothness for crisp icon speculars)
    bm_body = bmesh.new()
    bmesh.ops.create_uvsphere(bm_body, u_segments=32, v_segments=20, radius=1.0)
    for v in bm_body.verts:
        # Stretch into classic plump upright kidney-bean silhouette
        x, y, z = v.co.x, v.co.y, v.co.z
        z_scaled = z * 1.28
        # Gentle kidney-bean curvature along +X/-X and plump belly
        curve_x = -0.22 * (z * z) + 0.10
        pinch = 1.0 - 0.14 * math.exp(-((z * 2.2) ** 2)) * (1.0 if x > 0 else 0.2)
        v.co.x = x * 0.84 * pinch + curve_x
        v.co.y = y * 0.78
        v.co.z = z_scaled

    bean_body = common.create_mesh_object(
        "Icon_JellyBeanBody",
        bm_body,
        collection,
        material=common.get_or_create_material("jelly_cherry"),
        smooth=True,
    )
    bean_body.location = (0.0, 0.0, 1.38)
    bean_body.rotation_euler = Euler((math.radians(-4.0), math.radians(8.0), math.radians(-14.0)), "XYZ")
    created.append(bean_body)

    # 2. Cute glossy eyes + dual white catchlights + rosy cheeks + cheerful smile
    def _add_sphere(
        name: str,
        radius: float,
        loc: tuple[float, float, float],
        scale: tuple[float, float, float],
        mat_name: str,
    ) -> bpy.types.Object:
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=radius)
        obj = common.create_mesh_object(
            name, bm, collection, material=common.get_or_create_material(mat_name), smooth=True
        )
        obj.location = loc
        obj.scale = scale
        obj.parent = bean_body
        created.append(obj)
        return obj

    # Left & right eyes on front (-Y face)
    for side, sgn in (("L", -1.0), ("R", 1.0)):
        _add_sphere(
            f"Icon_Eye_{side}",
            0.18,
            (sgn * 0.28 + 0.06, -0.70, 0.22),
            (0.92, 0.55, 1.05),
            "eye_licorice",
        )
        _add_sphere(
            f"Icon_EyeShineBig_{side}",
            0.062,
            (sgn * 0.28 + 0.11, -0.785, 0.29),
            (1.0, 0.65, 1.0),
            "eye_highlight",
        )
        _add_sphere(
            f"Icon_EyeShineSmall_{side}",
            0.030,
            (sgn * 0.28 + 0.02, -0.795, 0.15),
            (1.0, 0.65, 1.0),
            "eye_highlight",
        )
        _add_sphere(
            f"Icon_Cheek_{side}",
            0.13,
            (sgn * 0.44 + 0.05, -0.64, -0.02),
            (1.15, 0.45, 0.72),
            "cheek_blush",
        )

    # Smooth curved smile tube hugging the front jelly surface
    bm_smile = bmesh.new()
    smile_steps = 16
    tube_segs = 10
    tube_r = 0.036
    smile_rings: list[list[bmesh.types.BMVert]] = []

    def _smile_center(t: float) -> Vector:
        return Vector(
            (
                0.06 + t * 0.175,
                -0.788 + 0.048 * (t * t),
                -0.105 + 0.078 * (t * t),
            )
        )

    for step in range(smile_steps + 1):
        t = -1.0 + 2.0 * (step / smile_steps)
        p = _smile_center(t)
        # Tangent via central difference
        p_prev = _smile_center(max(-1.0, t - 0.02))
        p_next = _smile_center(min(1.0, t + 0.02))
        tangent = (p_next - p_prev).normalized()
        up_ref = Vector((0.0, 0.0, 1.0))
        binorm = tangent.cross(up_ref).normalized()
        norm = binorm.cross(tangent).normalized()

        # Taper ends gently into rounded tips
        end_taper = math.sqrt(max(0.18, 1.0 - 0.85 * (t * t) ** 4))
        r_here = tube_r * end_taper
        ring_v: list[bmesh.types.BMVert] = []
        for k in range(tube_segs):
            ang = (2.0 * math.pi * k) / tube_segs
            offset = r_here * (math.cos(ang) * norm + math.sin(ang) * binorm)
            ring_v.append(bm_smile.verts.new(p + offset))
        smile_rings.append(ring_v)

    for s in range(smile_steps):
        ra = smile_rings[s]
        rb = smile_rings[s + 1]
        for k in range(tube_segs):
            kn = (k + 1) % tube_segs
            bm_smile.faces.new((ra[k], rb[k], rb[kn], ra[kn]))

    # Rounded end caps
    bm_smile.faces.new(list(reversed(smile_rings[0])))
    bm_smile.faces.new(smile_rings[-1])

    smile_obj = common.create_mesh_object(
        "Icon_Smile",
        bm_smile,
        collection,
        material=common.get_or_create_material("eye_licorice"),
        smooth=True,
    )
    smile_obj.parent = bean_body
    created.append(smile_obj)

    # 3. Miniature pastel candy-meadow cushion underneath the bean
    bm_mound = bmesh.new()
    bmesh.ops.create_uvsphere(bm_mound, u_segments=28, v_segments=14, radius=1.25)
    for v in bm_mound.verts:
        v.co.z = v.co.z * 0.36
    mound = common.create_mesh_object(
        "Icon_CandyMeadowBase",
        bm_mound,
        collection,
        material=common.get_or_create_material("grass_mint"),
        smooth=True,
    )
    mound.location = (0.0, 0.0, 0.10)
    created.append(mound)

    # 4. Two tiny glossy floating sugar-berry accent orbs flanking the bean
    for idx, (loc, rad, mat_name) in enumerate(
        [
            ((-1.05, -0.15, 2.05), 0.18, "jelly_gold"),
            ((1.12, -0.10, 1.85), 0.15, "jelly_bubblegum"),
            ((0.95, -0.25, 0.65), 0.16, "jelly_lime"),
        ]
    ):
        bm_orb = bmesh.new()
        bmesh.ops.create_uvsphere(bm_orb, u_segments=18, v_segments=12, radius=rad)
        orb = common.create_mesh_object(
            f"Icon_SugarOrb_{idx}",
            bm_orb,
            collection,
            material=common.get_or_create_material(mat_name),
            smooth=True,
        )
        orb.location = loc
        created.append(orb)

    return created


# ---------------------------------------------------------------------------
# Main Build Entrypoint
# ---------------------------------------------------------------------------

def main() -> dict[str, object]:
    common.ensure_dirs()
    common.reset_scene()

    # Collections
    island_coll = common.ensure_collection("IslandRing0")
    icon_coll = common.ensure_collection("AppIconSubject")
    studio_coll = common.ensure_collection("Studio")

    # Build Ring 0 island & app icon subject
    island_objects = build_island_ring0(island_coll)
    icon_objects = build_app_icon_subject(icon_coll)

    # Hide icon subject from default island viewport/render
    for obj in icon_objects:
        obj.hide_viewport = True
        obj.hide_render = True

    # Setup studio lights & main diorama preview camera for island inspection
    common.setup_world_lighting("#C9ECFF", strength=0.80)
    common.setup_studio_lights(studio_coll)

    cam_data = bpy.data.cameras.new("PreviewCamera")
    cam_data.lens = 42.0
    cam_obj = bpy.data.objects.new("PreviewCamera", cam_data)
    cam_obj.location = (7.2, -9.2, 6.4)
    studio_coll.objects.link(cam_obj)
    common.point_camera_at(cam_obj, Vector((0.0, 0.0, -0.45)))
    bpy.context.scene.camera = cam_obj

    # 1. Export public/assets/models/island_ring0.glb
    glb_report = common.export_glb(
        island_objects,
        common.PUBLIC_MODELS_DIR / "island_ring0.glb",
    )

    # 2. Render studio glossy app icons (solid pastel sky background for iOS Home Screen)
    icon_512_report = common.render_icon_png(
        icon_objects,
        common.PUBLIC_ICONS_DIR / "app_icon_512.png",
        size=512,
        transparent=False,
        bg_hex="#8FD9FB",
        cam_azimuth_deg=12.0,
        cam_elevation_deg=8.0,
        ortho=True,
        margin=1.22,
        samples=32,
    )
    icon_180_report = common.render_icon_png(
        icon_objects,
        common.PUBLIC_ICONS_DIR / "apple_touch_icon_180.png",
        size=180,
        transparent=False,
        bg_hex="#8FD9FB",
        cam_azimuth_deg=12.0,
        cam_elevation_deg=8.0,
        ortho=True,
        margin=1.22,
        samples=24,
    )

    # 3. Render diorama verification thumbnail of island_ring0 (showing cliff & 7 pads)
    thumb_report = common.render_icon_png(
        island_objects,
        common.THUMBNAIL_DIR / "island_ring0_thumb.png",
        size=512,
        transparent=False,
        bg_hex="#BCE8FF",
        cam_azimuth_deg=34.0,
        cam_elevation_deg=17.0,
        ortho=False,
        margin=1.18,
        samples=24,
    )

    # Restore preview world color
    common.setup_world_lighting("#C9ECFF", strength=0.80)

    # 4. Save clean source .blend file
    blend_path = common.BLEND_DIR / "core_island.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    # Assert PR-02 budgets
    root_obj = island_objects[0]
    assert tuple(round(c, 5) for c in root_obj.location) == (0.0, 0.0, 0.0), (
        f"Expected island_ring0 origin at (0,0,0), got {tuple(root_obj.location)}"
    )
    assert tuple(round(c, 5) for c in root_obj.scale) == (1.0, 1.0, 1.0), (
        f"Expected island_ring0 scale (1,1,1), got {tuple(root_obj.scale)}"
    )
    assert glb_report["triangles"] <= 2000, (
        f"Triangle budget exceeded: {glb_report['triangles']} > 2000"
    )
    assert glb_report["size_bytes"] < 100 * 1024, (
        f"GLB size budget exceeded: {glb_report['size_bytes']} bytes >= 100 KB"
    )

    return {
        "blend_path": str(blend_path),
        "island_glb": glb_report,
        "app_icon_512": icon_512_report,
        "apple_touch_icon_180": icon_180_report,
        "island_thumbnail": thumb_report,
        "root_origin": list(root_obj.location),
        "root_scale": list(root_obj.scale),
        "plot_pad_count": len(island_objects) - 1,
    }


if __name__ == "__main__":
    summary = main()
    print(summary)
