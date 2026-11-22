import { SceneryBatches } from './scenery/batches.js';
import { createSceneryMaterials } from './scenery/materials.js';
import { addBuildings, addFields } from './scenery/architecture.js';
import { addVegetation } from './scenery/vegetation.js';
import { addFurniture } from './scenery/furniture.js';
import { addLighthouse, addBridge, addDocksAndBoats, addWindmills, addSummit } from './scenery/landmarks.js';

export function addScenery(scene, route, landscape) {
  const materials = createSceneryMaterials();
  const batches = new SceneryBatches(200);
  const housePlots = addBuildings(batches, route, landscape, materials);
  addVegetation(batches, route, landscape, materials, housePlots);
  addFields(batches, scene, route, landscape, materials);
  addFurniture(batches, scene, route, landscape, materials);
  addLighthouse(batches, route, landscape, materials);
  addBridge(batches, route, landscape, materials);
  addDocksAndBoats(batches, route, landscape, materials);
  addSummit(batches, route, landscape, materials);
  const updateWindmills = addWindmills(scene, batches, route, landscape, materials);
  const root = batches.finish(scene);
  return { update(time) { updateWindmills(time); }, stats: root.userData.sceneryStats };
}
