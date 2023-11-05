use naturalneighbor::{Lerpable, Point};
use node::{parse_nodes, Node};
use procedural_terrain::{
    core::attributes::TerrainAttributes,
    lem::generator::TerrainGenerator,
    models::surface::{builder::TerrainModel2DBulider, sites::Site2D},
};
use rand::{Rng, SeedableRng};
use wasm_bindgen::{prelude::wasm_bindgen, JsValue};
use web_sys::ImageData;

mod node;
mod preview;

#[wasm_bindgen]
pub fn nearest_node_buffer(
    buffer_width: u32,
    buffer_height: u32,
    pixel_scale: u32,
    nodes: Vec<JsValue>,
) -> Vec<f64> {
    let nodes = parse_nodes(nodes, 1.0, 1.0);
    preview::set_nearest_node_buffer(buffer_width, buffer_height, pixel_scale, nodes)
        .into_iter()
        .flatten()
        .collect::<Vec<f64>>()
}

#[wasm_bindgen]
pub fn run_terrain_generator(
    surface_width: u32,
    surface_height: u32,
    img_width: u32,
    img_height: u32,
    n: u32,
    edge_node: u32,
    nodes: Vec<JsValue>,
    grayscale: bool,
) -> ImageData {
    let bound_max = Site2D {
        x: 200.0 * 1e3,
        y: 200.0 * 1e3 * (surface_height as f64 / surface_width as f64),
    };

    let nodes = parse_nodes(
        nodes,
        bound_max.x / surface_width as f64,
        bound_max.y / surface_height as f64,
    );

    let corners = [
        (0.0, 0.0),
        (bound_max.x, 0.0),
        (bound_max.x, bound_max.y),
        (0.0, bound_max.y),
    ];

    let corner_nodes = corners
        .iter()
        .enumerate()
        .flat_map(|(i, _)| {
            let node1 = corners[i];
            let node2 = corners[(i + 1) % corners.len()];
            (0..edge_node)
                .map(|j| {
                    let t = j as f64 / edge_node as f64;
                    (node1.0.lerp(&node2.0, t), node1.1.lerp(&node2.1, t))
                })
                .collect::<Vec<_>>()
        })
        .map(|(x, y)| {
            let nearest = nodes
                .iter()
                .map(|node| (node, (node.x - x).powi(2) + (node.y - y).powi(2)))
                .min_by(|(_, d1), (_, d2)| d1.partial_cmp(d2).unwrap())
                .unwrap()
                .0;
            Node {
                x,
                y,
                erodibility: nearest.erodibility,
                is_ocean: nearest.is_ocean,
            }
        })
        .collect::<Vec<Node>>();

    let nodes = nodes.into_iter().chain(corner_nodes).collect::<Vec<Node>>();

    let node_interpolator = naturalneighbor::Interpolator::new(&nodes);

    let mut rng = rand::rngs::StdRng::seed_from_u64(0);

    let nodes = (0..n)
        .filter_map(|_| {
            let x = rng.gen_range(0.0..bound_max.x);
            let y = rng.gen_range(0.0..bound_max.y);
            let opnode = node_interpolator.interpolate(&nodes, Point { x, y });
            opnode.map(|node| Node {
                x,
                y,
                erodibility: node.erodibility,
                is_ocean: node.is_ocean,
            })
        })
        .collect::<Vec<Node>>();

    let outlets = nodes
        .iter()
        .enumerate()
        .filter(|(_, node)| node.is_ocean)
        .map(|(i, _)| i)
        .collect::<Vec<usize>>();

    let model_raw = TerrainModel2DBulider::default()
        .set_sites(
            nodes
                .iter()
                .map(|node| Site2D {
                    x: node.x,
                    y: node.y,
                })
                .collect::<Vec<Site2D>>(),
        )
        .set_bounding_box(Some(Site2D { x: 0.0, y: 0.0 }), Some(bound_max));

    let model = {
        if outlets.is_empty() {
            model_raw.build().unwrap()
        } else {
            model_raw.set_custom_outlets(outlets).build().unwrap()
        }
    };

    let terrain = TerrainGenerator::default()
        .set_model(model)
        .set_attributes(
            nodes
                .iter()
                .map(|node| TerrainAttributes::new(0.0, 100.0, node.erodibility, None))
                .collect::<Vec<TerrainAttributes>>(),
        )
        .generate()
        .unwrap();

    let max_altitude = 2000.;
    let max_shadow_altitude = 350.;
    let cmp_dist = 0.5 * 1e3;

    let mut buffer: image::ImageBuffer<image::Rgb<u8>, Vec<u8>> =
        image::RgbImage::new(img_width, img_height);

    let colors = {
        if grayscale {
            vec![([0, 0, 0], 0.0), ([255, 255, 255], 1.0)]
        } else {
            vec![
                ([50, 130, 200], 0.0),
                ([240, 240, 210], 0.005),
                // water level
                ([190, 200, 120], 0.05),
                ([180, 200, 80], 0.2),
                ([25, 100, 25], 0.75),
                ([15, 60, 15], 1.0),
            ]
        }
    };

    let crop_prop = 0.9;

    for imgx in 0..img_width {
        for imgy in 0..img_height {
            let x = bound_max.x * (imgx as f64 / img_width as f64);
            let y = bound_max.y * (imgy as f64 / img_height as f64);
            let x = x * crop_prop + bound_max.x * (1.0 - crop_prop) * 0.5;
            let y = y * crop_prop + bound_max.y * (1.0 - crop_prop) * 0.5;
            let site = Site2D { x, y };
            let altitude = terrain.get_altitude(&site);

            let altitude2 = terrain.get_altitude(&Site2D {
                x: site.x + cmp_dist,
                y: site.y + cmp_dist,
            });
            if let (Some(altitude), Some(altitude2)) = (altitude, altitude2) {
                let prop = altitude / max_altitude;

                let color: [u8; 3] = {
                    let mut color = [0, 0, 0];
                    if prop >= colors[colors.len() - 1].1 {
                        color = colors[colors.len() - 1].0;
                        color
                    } else if prop <= colors[0].1 {
                        color = colors[0].0;
                        color
                    } else {
                        for i in 0..colors.len() - 1 {
                            if colors[i].1 <= prop && prop < colors[i + 1].1 {
                                let prop2 = (prop - colors[i].1) / (colors[i + 1].1 - colors[i].1);
                                let color1 = colors[i].0;
                                let color2 = colors[i + 1].0;
                                color = [
                                    (color2[0] as f64 * prop2 + color1[0] as f64 * (1.0 - prop2))
                                        as u8,
                                    (color2[1] as f64 * prop2 + color1[1] as f64 * (1.0 - prop2))
                                        as u8,
                                    (color2[2] as f64 * prop2 + color1[2] as f64 * (1.0 - prop2))
                                        as u8,
                                ];
                                break;
                            }
                        }
                        color
                    }
                };

                if grayscale {
                    buffer.put_pixel(imgx, imgy, image::Rgb(color));
                    continue;
                }

                let brightness = 1.0
                    - (((altitude - altitude2) / max_shadow_altitude).atan() / 1.57).min(1.0)
                        * (prop * 0.8 + 0.2)
                    + 0.05 * rng.gen_range(0.0..1.0);

                let color = [
                    (color[0] as f64 * brightness) as u8,
                    (color[1] as f64 * brightness) as u8,
                    (color[2] as f64 * brightness) as u8,
                ];

                buffer.put_pixel(imgx, imgy, image::Rgb(color));
            }
        }
    }

    let (width, height) = buffer.dimensions();
    let mut u8_buffer = Vec::with_capacity((width * height * 4) as usize);
    for pixel in buffer.pixels() {
        u8_buffer.extend_from_slice(&[pixel[0], pixel[1], pixel[2], 255]);
    }
    let data = wasm_bindgen::Clamped(u8_buffer);
    web_sys::ImageData::new_with_u8_clamped_array_and_sh(
        wasm_bindgen::Clamped(&data),
        width,
        height,
    )
    .unwrap()
}
