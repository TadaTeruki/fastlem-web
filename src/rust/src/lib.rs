use naturalneighbor::{Lerpable, Point};
use node::{parse_nodes, Node};
use procedural_terrain::{
    core::attributes::TerrainAttributes,
    lem::generator::TerrainGenerator,
    models::surface::{builder::TerrainModel2DBulider, sites::Site2D, terrain::Terrain2D}
};
use rand::{Rng, SeedableRng};
use wasm_bindgen::{prelude::wasm_bindgen, JsValue};

mod node;
mod preview;

static SURFACE_DIST: f64 = 200. * 1e3;
static COMMON_UPLIFT_RATE: f64 = 100.;

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
pub struct TerrainObject {
    terrain: Terrain2D,
    scale: Site2D,
}

#[wasm_bindgen]
impl TerrainObject {
    pub fn get_altitude(&self, x: f64, y: f64) -> f64 {
        let site = Site2D {
            x: x * self.scale.x,
            y: y * self.scale.y,
        };
        let altitude = self.terrain.get_altitude(&site);
        if let Some(altitude) = altitude {
            altitude
        } else {
            -1.0
        }
    }
}

#[wasm_bindgen]
pub fn run_terrain_generator(
    image_width: u32,
    image_height: u32,
    node_num: u32,
    edge_node: u32,
    nodes: Vec<JsValue>,
) -> TerrainObject {
    let bound_max = Site2D {
        x: SURFACE_DIST,
        y: SURFACE_DIST * (image_height as f64 / image_width as f64),
    };

    let nodes = parse_nodes(
        nodes,
        bound_max.x / image_width as f64,
        bound_max.y / image_height as f64,
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

    let nodes = (0..node_num)
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
                .map(|node| TerrainAttributes::new(0.0, COMMON_UPLIFT_RATE, node.erodibility, None))
                .collect::<Vec<TerrainAttributes>>(),
        )
        .generate()
        .unwrap();

    TerrainObject { terrain, scale: Site2D { x: bound_max.x / image_width as f64 , y: bound_max.y / image_height as f64 } }
    /*
    (0..image_height)
        .flat_map(|y| {
            (0..image_width)
                .map(|x| {
                    let x = bound_max.x * (x as f64 / image_width as f64);
                    let y = bound_max.y * (y as f64 / image_height as f64);
                    let site = Site2D { x, y };
                    let altitude = terrain.get_altitude(&site);
                    if let Some(altitude) = altitude {
                        altitude
                    } else {
                        -1.0
                    }
                })
                .collect::<Vec<f64>>()
        })
        .collect::<Vec<f64>>()
    */
}
