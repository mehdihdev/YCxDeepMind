# ELEGOO V4 CAD Notes

This example repo keeps the MuJoCo model grounded in the official ELEGOO Smart Robot Car geometry.

- Source snapshot used for alignment: `Elegoo.STEP`
- Exported mesh assets used by MuJoCo: `Bottom Plate.stl`, `Top Plate.stl`, `Dead Plate.stl`
- MuJoCo model: `../../mujoco/elegoo_car.xml`

The MuJoCo XML is still a simplified physics model, but the plate placement, wheelbase, ultrasonic mast, and front camera module are laid out to match the physical V4 car closely enough for Live Bench demos.
