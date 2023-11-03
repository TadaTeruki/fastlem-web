use naturalneighbor::{Lerpable, Point};
use serde::{Deserialize, Serialize};
use wasm_bindgen::{prelude::wasm_bindgen, JsValue};

#[derive(Default, Serialize, Deserialize, Clone)]
#[wasm_bindgen]
pub struct Node {
    pub x: f64,
    pub y: f64,
    pub erodibility: f64,
    pub is_ocean: bool,
}

impl From<Node> for Point {
    fn from(val: Node) -> Self {
        Point { x: val.x, y: val.y }
    }
}

impl Lerpable for Node {
    fn lerp(&self, other: &Self, t: f64) -> Self {
        Node {
            x: self.x.lerp(&other.x, t),
            y: self.y.lerp(&other.y, t),
            erodibility: self.erodibility.lerp(&other.erodibility, t),
            is_ocean: {
                if t < 0.5 {
                    self.is_ocean
                } else {
                    other.is_ocean
                }
            },
        }
    }
}

pub fn parse_nodes(nodes: Vec<JsValue>, scale_x: f64, scale_y: f64) -> Vec<Node> {
    nodes
        .into_iter()
        .map(|node| {
            let node: Node = serde_wasm_bindgen::from_value(node).unwrap();
            Node {
                x: node.x * scale_x,
                y: node.y * scale_y,
                erodibility: node.erodibility,
                is_ocean: node.is_ocean,
            }
        })
        .collect::<Vec<Node>>()
}
