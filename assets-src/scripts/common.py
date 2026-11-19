"""Shared Blender MCP (bpy) asset pipeline utilities for Jelly Bean Simulator.

Provides deterministic clay/candy Principled BSDF materials, coordinate/grid
constants shared across concentric island rings, origin normalization,
triangle counting, glTF 2.0 (.glb) export, and orthographic/studio PNG
icon rendering.

Tested with Blender 5.2 LTS (BLENDER_EEVEE).
"""

from __future__ import annotations

import contextlib
import math
import os
from pathlib import Path
from typing import Iterable, Iterator, Sequence

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# ---------------------------------------------------------------------------
# Workspace paths & canonical diorama layout constants
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
ASSETS_SRC_DIR = REPO_ROOT / "assets-src"
BLEND_DIR = ASSETS_SRC_DIR / "blend"
THUMBNAIL_DIR = ASSETS_SRC_DIR / "thumbnails"
PUBLIC_MODELS_DIR = REPO_ROOT / "public" / "assets" / "models"
PUBLIC_ICONS_DIR = REPO_ROOT / "public" / "assets" / "icons"

# Playable island top ground surface sits at Blender Z = 0.0 (Three.js Y = 0.0).
# Every prop, building, crop, and character has its origin at its ground-center
# pivot (0, 0, 0) so placing objects at (x, 0, z) in Three.js sits flush.
ISLAND_SURFACE_Z = 0.0

# Ring 0 starter island dimensions (shared with Ring 1/2/3 expansion scripts)
RING0_TOP_RADIUS = 4.35
RING0_OUTER_RADIUS = 4.75
RING0_CLIFF_DEPTH = 2.25
RING0_PAD_RADIUS = 0.86
RING0_PAD_RING_DISTANCE = 2.45

# 7 canonical Ring 0 plot pad coordinates in Blender XY (Z = 0.0).
# Pad 0 is center; pads 1..6 form a hex ring starting at North (+Y in Blender,
# which maps to -Z / back-center in Three.js Y-up space).
RING0_PLOT_PADS: list[tuple[str, float, float]] = [
    ("plot_pad_0", 0.0, 0.0),
] + [
    (
        f"plot_pad_{i + 1}",
        round(RING0_PAD_RING_DISTANCE * math.cos(math.radians(90.0 - i * 60.0)), 4),
        round(RING0_PAD_RING_DISTANCE * math.sin(math.radians(90.0 - i * 60.0)), 4),
    )
    for i in range(6)
]


# ---------------------------------------------------------------------------
# Color & Principled BSDF Candy / Clay Material Palette
# ---------------------------------------------------------------------------

def srgb_channel_to_linear(c: float) -> float:
    """Convert a single sRGB channel [0..1] to linear RGB for Blender."""
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear_rgba(hex_color: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    """Convert '#RRGGBB' sRGB hex string to linear RGBA tuple for Blender BSDF."""
    s = hex_color.lstrip("#")
    if len(s) != 6:
        raise ValueError(f"Expected 6-digit hex color, got {hex_color!r}")
    r = srgb_channel_to_linear(int(s[0:2], 16) / 255.0)
    g = srgb_channel_to_linear(int(s[2:4], 16) / 255.0)
    b = srgb_channel_to_linear(int(s[4:6], 16) / 255.0)
    return (r, g, b, alpha)


# Material presets: (hex_color, roughness, coat_weight, coat_roughness, metallic, specular)
PALETTE: dict[str, tuple[str, float, float, float, float, float]] = {
    # Matte pastel clay — terrain & architecture
    "grass_mint": ("#79DC97", 0.72, 0.0, 0.3, 0.0, 0.35),
    "grass_rim": ("#63C884", 0.75, 0.0, 0.3, 0.0, 0.35),
    "grass_tuft": ("#95E8A8", 0.70, 0.0, 0.3, 0.0, 0.35),
    "cliff_biscuit": ("#DDA06E", 0.78, 0.0, 0.3, 0.0, 0.30),
    "cliff_caramel": ("#B5744B", 0.82, 0.0, 0.3, 0.0, 0.25),
    "sand_cream": ("#F5E1B5", 0.76, 0.0, 0.3, 0.0, 0.30),
    "pad_soil": ("#E8C692", 0.80, 0.0, 0.3, 0.0, 0.25),
    "pad_trim": ("#FFF3DB", 0.68, 0.05, 0.3, 0.0, 0.40),
    "rock_lavender": ("#9EB0C9", 0.74, 0.0, 0.3, 0.0, 0.35),
    "rock_slate": ("#8496B0", 0.78, 0.0, 0.3, 0.0, 0.30),
    "wood_wafer": ("#C88A56", 0.72, 0.0, 0.3, 0.0, 0.35),
    "cream_frosting": ("#FFF8F0", 0.52, 0.15, 0.25, 0.0, 0.45),
    # Pastel flowers & candy accents
    "flower_strawberry": ("#FF709D", 0.48, 0.20, 0.20, 0.0, 0.50),
    "flower_lemon": ("#FFE066", 0.48, 0.20, 0.20, 0.0, 0.50),
    "flower_lavender": ("#C39BFF", 0.48, 0.20, 0.20, 0.0, 0.50),
    "flower_center": ("#FFF2B2", 0.55, 0.10, 0.25, 0.0, 0.45),
    # Glossy translucent-feel candy glaze — Jelly Beans & icons
    "jelly_cherry": ("#FF476F", 0.18, 0.90, 0.07, 0.0, 0.65),
    "jelly_bubblegum": ("#FF7EB6", 0.18, 0.90, 0.07, 0.0, 0.65),
    "jelly_berry": ("#4DA8F0", 0.18, 0.90, 0.07, 0.0, 0.65),
    "jelly_lime": ("#7CE88C", 0.18, 0.90, 0.07, 0.0, 0.65),
    "jelly_gold": ("#FFD15C", 0.20, 0.85, 0.08, 0.15, 0.70),
    "cheek_blush": ("#FF8FAB", 0.35, 0.35, 0.18, 0.0, 0.50),
    "eye_licorice": ("#1D1426", 0.10, 0.95, 0.05, 0.0, 0.80),
    "eye_highlight": ("#FFFFFF", 0.08, 0.50, 0.10, 0.0, 0.50),
    "icon_sky_backdrop": ("#8FD9FB", 0.90, 0.0, 0.5, 0.0, 0.10),
}


def get_or_create_material(
    name: str,
    hex_color: str | None = None,
    *,
    roughness: float | None = None,
    coat_weight: float | None = None,
    coat_roughness: float | None = None,
    metallic: float | None = None,
    specular: float | None = None,
    emission_hex: str | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    """Create or fetch a Principled BSDF material from PALETTE or explicit params."""
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if bsdf is None:
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    if name in PALETTE:
        p_hex, p_rough, p_coat, p_coat_r, p_metal, p_spec = PALETTE[name]
    else:
        p_hex, p_rough, p_coat, p_coat_r, p_metal, p_spec = (
            "#FFFFFF",
            0.65,
            0.0,
            0.25,
            0.0,
            0.45,
        )

    final_hex = hex_color if hex_color is not None else p_hex
    rgba = hex_to_linear_rgba(final_hex)
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = p_rough if roughness is None else roughness
    bsdf.inputs["Metallic"].default_value = p_metal if metallic is None else metallic

    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = (
            p_spec if specular is None else specular
        )
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = (
            p_coat if coat_weight is None else coat_weight
        )
    if "Coat Roughness" in bsdf.inputs:
        bsdf.inputs["Coat Roughness"].default_value = (
            p_coat_r if coat_roughness is None else coat_roughness
        )
    if emission_hex is not None and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = hex_to_linear_rgba(emission_hex)
        bsdf.inputs["Emission Strength"].default_value = emission_strength

    # Set viewport display color to match sRGB approximation
    mat.diffuse_color = rgba
    return mat


def assign_material(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    """Assign a single material to a mesh object."""
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


# ---------------------------------------------------------------------------
# Scene, Collection & Mesh Helpers
# ---------------------------------------------------------------------------

def reset_scene() -> None:
    """Reset Blender to a clean empty metric scene without altering user preferences."""
    bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"


def ensure_collection(
    name: str, parent: bpy.types.Collection | None = None
) -> bpy.types.Collection:
    """Get or create a collection linked under parent (or Scene Collection)."""
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        target_parent = parent or bpy.context.scene.collection
        target_parent.children.link(coll)
    return coll


def link_object_exclusively(
    obj: bpy.types.Object, collection: bpy.types.Collection
) -> None:
    """Link an object only to the specified collection."""
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)


def create_mesh_object(
    name: str,
    bm: bmesh.types.BMesh,
    collection: bpy.types.Collection,
    material: bpy.types.Material | None = None,
    smooth: bool = False,
) -> bpy.types.Object:
    """Create a mesh object from a BMesh, link it to collection, and free BMesh."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if smooth:
        for poly in mesh.polygons:
            poly.use_smooth = True
    else:
        for poly in mesh.polygons:
            poly.use_smooth = False
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    if material is not None:
        assign_material(obj, material)
    return obj


def set_shading(obj: bpy.types.Object, smooth: bool = True) -> None:
    """Set smooth or flat shading across all polygons of a mesh object."""
    if obj.type != "MESH":
        return
    for poly in obj.data.polygons:
        poly.use_smooth = smooth
    obj.data.update()


def bake_transforms(obj: bpy.types.Object) -> None:
    """Bake local rotation and scale into mesh geometry and reset to identity."""
    if obj.type != "MESH":
        return
    rot_scale = obj.matrix_basis.to_3x3().to_4x4()
    obj.data.transform(rot_scale)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    obj.data.update()


def normalize_origin_to_base(
    obj: bpy.types.Object, *, center_xy: bool = True, target_z: float = 0.0
) -> None:
    """Shift mesh vertices so bounding box base sits at Z=target_z and origin is (0,0,0)."""
    if obj.type != "MESH":
        return
    bake_transforms(obj)
    # Also bake current location offset into vertices before re-centering
    if obj.location.length > 1e-6:
        obj.data.transform(Matrix.Translation(obj.location))
        obj.location = (0.0, 0.0, 0.0)

    verts = obj.data.vertices
    if not verts:
        return

    xs = [v.co.x for v in verts]
    ys = [v.co.y for v in verts]
    zs = [v.co.z for v in verts]
    dx = -0.5 * (min(xs) + max(xs)) if center_xy else 0.0
    dy = -0.5 * (min(ys) + max(ys)) if center_xy else 0.0
    dz = target_z - min(zs)

    obj.data.transform(Matrix.Translation((dx, dy, dz)))
    obj.location = (0.0, 0.0, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    obj.data.update()


def normalize_terrain_origin(obj: bpy.types.Object) -> None:
    """Bake all transforms into a terrain mesh while preserving world Z=0 ground plane."""
    if obj.type != "MESH":
        return
    obj.data.transform(obj.matrix_basis)
    obj.location = (0.0, 0.0, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    obj.data.update()


def join_mesh_objects(
    objects: Sequence[bpy.types.Object],
    name: str,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    """Join multiple mesh objects via BMesh (context-independent), preserving materials & shading."""
    if not objects:
        raise ValueError("join_mesh_objects requires at least one mesh object")

    bpy.context.view_layer.update()

    # Build deduplicated material list across all source objects
    materials: list[bpy.types.Material] = []
    mat_to_idx: dict[bpy.types.Material, int] = {}
    for obj in objects:
        for mat in obj.data.materials:
            if mat is not None and mat not in mat_to_idx:
                mat_to_idx[mat] = len(materials)
                materials.append(mat)

    combined_bm = bmesh.new()
    for obj in objects:
        if obj.type != "MESH":
            continue
        src_mesh = obj.data
        src_bm = bmesh.new()
        src_bm.from_mesh(src_mesh)
        if obj.matrix_world != Matrix.Identity(4):
            bmesh.ops.transform(src_bm, matrix=obj.matrix_world, verts=src_bm.verts)

        # Remap material indices to unified material table
        slot_remap: dict[int, int] = {}
        for slot_i, mat in enumerate(src_mesh.materials):
            if mat in mat_to_idx:
                slot_remap[slot_i] = mat_to_idx[mat]
        for face in src_bm.faces:
            face.material_index = slot_remap.get(face.material_index, 0)

        # Copy geometry into combined_bm preserving smooth flag & material_index
        vert_map: dict[bmesh.types.BMVert, bmesh.types.BMVert] = {}
        for v in src_bm.verts:
            vert_map[v] = combined_bm.verts.new(v.co)
        for f in src_bm.faces:
            try:
                nf = combined_bm.faces.new([vert_map[v] for v in f.verts])
                nf.material_index = f.material_index
                nf.smooth = f.smooth
            except ValueError:
                pass
        src_bm.free()

    bmesh.ops.recalc_face_normals(combined_bm, faces=combined_bm.faces)
    out_mesh = bpy.data.meshes.new(name)
    combined_bm.to_mesh(out_mesh)
    combined_bm.free()
    for mat in materials:
        out_mesh.materials.append(mat)
    out_mesh.update()

    joined = bpy.data.objects.new(name, out_mesh)
    collection.objects.link(joined)

    # Remove old source objects and orphaned meshes
    for obj in objects:
        old_data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if old_data.users == 0:
            bpy.data.meshes.remove(old_data)

    return joined


def count_triangles(objects: Iterable[bpy.types.Object]) -> int:
    """Return total evaluated triangle count across the given mesh objects."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    total = 0
    for obj in objects:
        if obj.type != "MESH":
            continue
        eval_obj = obj.evaluated_get(depsgraph)
        eval_mesh = eval_obj.to_mesh()
        try:
            eval_mesh.calc_loop_triangles()
            total += len(eval_mesh.loop_triangles)
        finally:
            eval_obj.to_mesh_clear()
    return total


def get_combined_bounds(
    objects: Iterable[bpy.types.Object],
) -> tuple[Vector, Vector]:
    """Return exact world-space (min_vec, max_vec) across all given mesh objects."""
    bpy.context.view_layer.update()
    mins = Vector((float("inf"), float("inf"), float("inf")))
    maxs = Vector((float("-inf"), float("-inf"), float("-inf")))
    for obj in objects:
        if obj.type != "MESH":
            continue
        mat_w = obj.matrix_world
        for v in obj.data.vertices:
            world_pt = mat_w @ v.co
            mins.x = min(mins.x, world_pt.x)
            mins.y = min(mins.y, world_pt.y)
            mins.z = min(mins.z, world_pt.z)
            maxs.x = max(maxs.x, world_pt.x)
            maxs.y = max(maxs.y, world_pt.y)
            maxs.z = max(maxs.z, world_pt.z)
    return mins, maxs


# ---------------------------------------------------------------------------
# glTF 2.0 (.glb) Export & Studio PNG Rendering
# ---------------------------------------------------------------------------

@contextlib.contextmanager
def view3d_context_override(
    active_object: bpy.types.Object | None = None,
    selected_objects: Sequence[bpy.types.Object] | None = None,
) -> Iterator[None]:
    """Provide a VIEW_3D context override when invoked from timer/MCP callbacks."""
    override: dict[str, object] = {}
    wm = getattr(bpy.context, "window_manager", None)
    if wm and wm.windows:
        win = wm.windows[0]
        override["window"] = win
        override["screen"] = win.screen
        for area in win.screen.areas:
            if area.type == "VIEW_3D":
                override["area"] = area
                for region in area.regions:
                    if region.type == "WINDOW":
                        override["region"] = region
                        break
                break
    if active_object is not None:
        override["active_object"] = active_object
        override["object"] = active_object
    if selected_objects is not None:
        override["selected_objects"] = list(selected_objects)
        override["selected_editable_objects"] = list(selected_objects)

    if override:
        with bpy.context.temp_override(**override):
            yield
    else:
        yield


def export_glb(
    objects: Sequence[bpy.types.Object],
    filepath: str | Path,
) -> dict[str, object]:
    """Export selected objects to a Y-up .glb file with applied modifiers & materials."""
    out_path = Path(filepath)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.context.view_layer.update()
    for obj in list(bpy.context.view_layer.objects):
        if obj is not None and not obj.hide_viewport:
            obj.select_set(False)
    for obj in objects:
        obj.hide_viewport = False
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.context.view_layer.update()

    with view3d_context_override(active_object=objects[0], selected_objects=objects):
        bpy.ops.export_scene.gltf(
            filepath=str(out_path),
            export_format="GLB",
            use_selection=True,
            export_yup=True,
            export_apply=True,
            export_materials="EXPORT",
            export_vertex_color="MATERIAL",
        )

    size_bytes = out_path.stat().st_size
    tris = count_triangles(objects)
    return {
        "filepath": str(out_path),
        "size_bytes": size_bytes,
        "size_kb": round(size_bytes / 1024.0, 2),
        "triangles": tris,
    }


def setup_world_lighting(
    sky_hex: str = "#D7F3FF",
    strength: float = 0.55,
    camera_bg_strength: float = 1.0,
) -> None:
    """Configure crisp camera sky color with balanced softer ambient lighting."""
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new("CandyWorld")
    world = scene.world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()

    rgba = hex_to_linear_rgba(sky_hex)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    mix = nt.nodes.new("ShaderNodeMixShader")
    lp = nt.nodes.new("ShaderNodeLightPath")

    bg_illum = nt.nodes.new("ShaderNodeBackground")
    bg_illum.inputs["Color"].default_value = rgba
    bg_illum.inputs["Strength"].default_value = strength

    bg_cam = nt.nodes.new("ShaderNodeBackground")
    bg_cam.inputs["Color"].default_value = rgba
    bg_cam.inputs["Strength"].default_value = camera_bg_strength

    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
    nt.links.new(bg_illum.outputs["Background"], mix.inputs[1])
    nt.links.new(bg_cam.outputs["Background"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])


def setup_studio_lights(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    """Create a crisp 3-point toyetic studio light rig (key, fill, warm rim)."""
    lights: list[bpy.types.Object] = []

    def _add_light(
        name: str,
        light_type: str,
        energy: float,
        color_hex: str,
        location: tuple[float, float, float],
        rotation_deg: tuple[float, float, float],
        size: float = 4.0,
    ) -> bpy.types.Object:
        ldata = bpy.data.lights.new(name=name, type=light_type)
        ldata.energy = energy
        rgba = hex_to_linear_rgba(color_hex)
        ldata.color = (rgba[0], rgba[1], rgba[2])
        if light_type == "AREA":
            ldata.size = size
        elif light_type == "SUN":
            ldata.angle = math.radians(8.0)
        lobj = bpy.data.objects.new(name=name, object_data=ldata)
        lobj.location = location
        lobj.rotation_euler = Euler(
            tuple(math.radians(a) for a in rotation_deg), "XYZ"
        )
        collection.objects.link(lobj)
        return lobj

    lights.append(
        _add_light(
            "Studio_KeySun",
            "SUN",
            3.2,
            "#FFF8EC",
            (6.0, -6.0, 9.0),
            (46.0, 8.0, 34.0),
        )
    )
    lights.append(
        _add_light(
            "Studio_FillArea",
            "AREA",
            90.0,
            "#C9ECFF",
            (-6.0, -4.0, 4.5),
            (62.0, 0.0, -55.0),
            size=6.0,
        )
    )
    lights.append(
        _add_light(
            "Studio_RimArea",
            "AREA",
            110.0,
            "#FFE0F0",
            (-2.0, 7.0, 5.5),
            (118.0, 0.0, -165.0),
            size=5.0,
        )
    )
    return lights


def point_camera_at(cam_obj: bpy.types.Object, target: Vector) -> None:
    """Aim camera object smoothly at a 3D target point."""
    direction = target - cam_obj.location
    rot_quat = direction.to_track_quat("-Z", "Y")
    cam_obj.rotation_euler = rot_quat.to_euler()


def render_icon_png(
    objects: Sequence[bpy.types.Object],
    filepath: str | Path,
    *,
    size: int = 128,
    transparent: bool = True,
    bg_hex: str = "#8FD9FB",
    cam_azimuth_deg: float = 28.0,
    cam_elevation_deg: float = 22.0,
    ortho: bool = True,
    margin: float = 1.24,
    samples: int = 24,
) -> dict[str, object]:
    """Render target objects cleanly to a square studio PNG icon.

    Temporarily hides all other scene mesh objects during rendering so only
    `objects` appear in the icon, then restores original render visibility.
    """
    out_path = Path(filepath)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    scene = bpy.context.scene
    prev_cam = scene.camera
    prev_res_x = scene.render.resolution_x
    prev_res_y = scene.render.resolution_y
    prev_pct = scene.render.resolution_percentage
    prev_transparent = scene.render.film_transparent
    prev_path = scene.render.filepath
    prev_fmt = scene.render.image_settings.file_format
    prev_color_mode = scene.render.image_settings.color_mode
    prev_samples = scene.eevee.taa_render_samples

    # Save & override hide_render and hide_viewport so world matrices & bounds evaluate cleanly
    target_set = set(objects)
    prev_hide_render: dict[bpy.types.Object, bool] = {}
    prev_hide_viewport: dict[bpy.types.Object, bool] = {}
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            prev_hide_render[obj] = obj.hide_render
            obj.hide_render = obj not in target_set
            if obj in target_set:
                prev_hide_viewport[obj] = obj.hide_viewport
                obj.hide_viewport = False

    temp_coll = bpy.data.collections.new("_TempIconStudio")
    scene.collection.children.link(temp_coll)

    try:
        bpy.context.view_layer.update()
        mins, maxs = get_combined_bounds(objects)
        center = (mins + maxs) * 0.5
        extents = maxs - mins
        max_dim = max(extents.x, extents.y, extents.z, 0.1)

        az = math.radians(cam_azimuth_deg)
        el = math.radians(cam_elevation_deg)
        if ortho:
            dist = max_dim * 4.5
        else:
            # 55mm lens on 36mm sensor -> half-FOV tan = 18/55 ~= 0.327
            dist = max_dim * margin * 1.48
        cam_pos = center + Vector(
            (
                dist * math.cos(el) * math.sin(az),
                -dist * math.cos(el) * math.cos(az),
                dist * math.sin(el),
            )
        )

        cam_data = bpy.data.cameras.new("_IconCam")
        if ortho:
            cam_data.type = "ORTHO"
            cam_data.ortho_scale = max_dim * margin
        else:
            cam_data.type = "PERSP"
            cam_data.lens = 55.0
        cam_obj = bpy.data.objects.new("_IconCam", cam_data)
        cam_obj.location = cam_pos
        temp_coll.objects.link(cam_obj)
        point_camera_at(cam_obj, center)

        # Dedicated icon studio lighting scaled around target center
        def _icon_light(name: str, ltype: str, energy: float, hex_c: str, offset: Vector) -> None:
            ld = bpy.data.lights.new(name, type=ltype)
            ld.energy = energy
            rgba = hex_to_linear_rgba(hex_c)
            ld.color = (rgba[0], rgba[1], rgba[2])
            if ltype == "AREA":
                ld.size = max_dim * 2.5
            lo = bpy.data.objects.new(name, ld)
            lo.location = center + offset
            point_camera_at(lo, center)
            temp_coll.objects.link(lo)

        # Hide pre-existing lights temporarily so icon lighting is predictable
        prev_light_hide: dict[bpy.types.Object, bool] = {}
        for obj in bpy.data.objects:
            if obj.type == "LIGHT":
                prev_light_hide[obj] = obj.hide_render
                obj.hide_render = True

        _icon_light("_IconKey", "SUN", 2.8, "#FFFDF5", Vector((3.0, -3.5, 4.5)) * max_dim)
        _icon_light("_IconFill", "AREA", 24.0 * (max_dim ** 2), "#D5F0FF", Vector((-3.0, -2.5, 2.0)) * max_dim)
        _icon_light("_IconRim", "AREA", 36.0 * (max_dim ** 2), "#FFD9EC", Vector((-1.5, 3.2, 2.8)) * max_dim)

        setup_world_lighting(bg_hex, strength=0.48, camera_bg_strength=1.0)

        scene.camera = cam_obj
        scene.render.engine = "BLENDER_EEVEE"
        scene.eevee.taa_render_samples = samples
        scene.render.resolution_x = size
        scene.render.resolution_y = size
        scene.render.resolution_percentage = 100
        scene.render.film_transparent = transparent
        scene.render.image_settings.file_format = "PNG"
        scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
        scene.render.filepath = str(out_path)

        bpy.ops.render.render(write_still=True)

        for obj, was_hidden in prev_light_hide.items():
            obj.hide_render = was_hidden
    finally:
        for obj, was_hidden in prev_hide_render.items():
            obj.hide_render = was_hidden
        for obj, was_vp_hidden in prev_hide_viewport.items():
            obj.hide_viewport = was_vp_hidden
        for obj in list(temp_coll.objects):
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if isinstance(data, bpy.types.Camera):
                bpy.data.cameras.remove(data)
            elif isinstance(data, bpy.types.Light):
                bpy.data.lights.remove(data)
        scene.collection.children.unlink(temp_coll)
        bpy.data.collections.remove(temp_coll)

        scene.camera = prev_cam
        scene.render.resolution_x = prev_res_x
        scene.render.resolution_y = prev_res_y
        scene.render.resolution_percentage = prev_pct
        scene.render.film_transparent = prev_transparent
        scene.render.filepath = prev_path
        scene.render.image_settings.file_format = prev_fmt
        scene.render.image_settings.color_mode = prev_color_mode
        scene.eevee.taa_render_samples = prev_samples

    size_bytes = out_path.stat().st_size
    return {
        "filepath": str(out_path),
        "width": size,
        "height": size,
        "size_bytes": size_bytes,
    }


def ensure_dirs() -> None:
    """Create standard asset directories if they do not exist."""
    for d in (BLEND_DIR, THUMBNAIL_DIR, PUBLIC_MODELS_DIR, PUBLIC_ICONS_DIR):
        os.makedirs(d, exist_ok=True)
