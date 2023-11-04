use crate::node::Node;

pub struct VoronoiPixel {
    pub px: u32,
    pub py: u32,
    pub node_index: usize,
    pub sqdistance: f64,
}

impl std::cmp::Ord for VoronoiPixel {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        if self.sqdistance == other.sqdistance {
            std::cmp::Ordering::Equal
        } else if self.sqdistance < other.sqdistance {
            std::cmp::Ordering::Greater
        } else {
            std::cmp::Ordering::Less
        }
    }
}

impl std::cmp::PartialOrd for VoronoiPixel {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl std::cmp::PartialEq for VoronoiPixel {
    fn eq(&self, other: &Self) -> bool {
        self.node_index == other.node_index
    }
}

impl std::cmp::Eq for VoronoiPixel {}

pub fn set_nearest_node_buffer(
    buffer_width: u32,
    buffer_height: u32,
    pixel_scale: u32,
    nodes: Vec<Node>,
) -> Vec<Vec<f64>> {
    if nodes.is_empty() {
        return Vec::new();
    }

    let mut nearest_buffer = vec![vec![0.0; buffer_width as usize]; buffer_height as usize];

    let mut queue = std::collections::BinaryHeap::new();

    for (index, node) in nodes.iter().enumerate() {
        queue.push(VoronoiPixel {
            px: (node.x / pixel_scale as f64).ceil() as u32,
            py: (node.y / pixel_scale as f64).ceil() as u32,
            node_index: index,
            sqdistance: 0.0,
        });
    }

    let mut visited = vec![false; (buffer_width * buffer_height) as usize];

    while let Some(pixel) = queue.pop() {
        if visited[pixel.px as usize + pixel.py as usize * buffer_width as usize] {
            continue;
        }
        visited[pixel.px as usize + pixel.py as usize * buffer_width as usize] = true;

        nearest_buffer[pixel.py as usize][pixel.px as usize] = pixel.node_index as f64;
        let node = &nodes[pixel.node_index];
        let neighbours = [
            (pixel.px as i32, pixel.py as i32 - 1),
            (pixel.px as i32 - 1, pixel.py as i32),
            (pixel.px as i32 + 1, pixel.py as i32),
            (pixel.px as i32, pixel.py as i32 + 1),
        ];
        for neighbour in neighbours.iter() {
            if neighbour.0 < 0
                || neighbour.0 >= buffer_width as i32
                || neighbour.1 < 0
                || neighbour.1 >= buffer_height as i32
            {
                continue;
            }
            let nx = neighbour.0 as f64 * pixel_scale as f64;
            let ny = neighbour.1 as f64 * pixel_scale as f64;
            let sqdist = (nx - node.x).powi(2) + (ny - node.y).powi(2);
            queue.push(VoronoiPixel {
                px: neighbour.0 as u32,
                py: neighbour.1 as u32,
                node_index: pixel.node_index,
                sqdistance: sqdist,
            });
        }
    }

    nearest_buffer
}
