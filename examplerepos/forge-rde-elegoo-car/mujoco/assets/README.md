# ELEGOO Smart Robot Car V4.0 - MuJoCo Assets

This directory contains mesh files for the ELEGOO Smart Robot Car V4.0 MuJoCo model.

## Getting the Official CAD Files

1. Download from ELEGOO GitHub:
   ```
   https://github.com/elegooofficial/ELEGOO-Smart-Robot-Car-Kit-V4.0
   ```

2. Extract `Smart Robot Car 3D model.zip`

3. The ZIP typically contains STEP or STL files for:
   - Chassis plates (upper/lower acrylic)
   - Wheel assemblies
   - Motor mounts
   - Sensor brackets
   - Battery holder

## Converting CAD to MuJoCo-ready STL

### Option 1: Using FreeCAD (Free)
```bash
# Install FreeCAD
brew install freecad  # macOS

# Open STEP file, export as STL with proper scale
# Ensure units are in meters for MuJoCo
```

### Option 2: Using Blender (Free)
```bash
# Import STEP (with add-on) or STL
# Simplify mesh if needed (Decimate modifier)
# Export as STL, scale to meters
```

### Option 3: Using OnShape (Free, web-based)
1. Import STEP files
2. Export as STL
3. Apply scale factor (mm to m = 0.001)

## Required Mesh Files

Place these STL files in this directory:

| File | Description |
|------|-------------|
| `chassis_bottom.stl` | Lower acrylic plate |
| `chassis_top.stl` | Upper acrylic plate |
| `wheel.stl` | Wheel with tire |
| `motor_mount.stl` | DC motor + mount bracket |
| `ultrasonic_mount.stl` | HC-SR04 sensor + servo bracket |
| `servo_sg90.stl` | SG90 micro servo |

## Mesh Optimization Tips

1. **Simplify**: Reduce polygon count for faster simulation
   - Visual meshes: 1000-5000 faces
   - Collision meshes: 100-500 faces (or use primitives)

2. **Center origin**: Place mesh origin at center of mass or joint location

3. **Scale**: MuJoCo uses meters, ELEGOO CAD is likely in mm
   - Apply `scale="0.001 0.001 0.001"` in XML, or
   - Pre-scale in your CAD software

4. **Separate collision meshes**: Create simplified convex hulls for physics

## Updating the MuJoCo Model

After adding meshes, uncomment the mesh definitions in `elegoo_car.xml`:

```xml
<asset>
  <mesh name="chassis" file="chassis_bottom.stl" scale="0.001 0.001 0.001"/>
  <mesh name="wheel" file="wheel.stl" scale="0.001 0.001 0.001"/>
  <!-- etc -->
</asset>
```

Then replace primitive geoms with mesh geoms:
```xml
<geom type="mesh" mesh="chassis" material="chassis_mat"/>
```
