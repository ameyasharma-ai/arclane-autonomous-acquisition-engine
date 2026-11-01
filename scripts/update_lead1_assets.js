import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { mapsPhotoPipeline } from '../src/engine/maps_photo_pipeline.js';

const candidates = [
  'https://lh3.googleusercontent.com/grass-cs/AABkmLcyDKkmWX1By2dDwlMddZOMoK5yvh_qOr6wRzGCTQjr0PDWUYrNZRmI0pAJvLWZUYgkarvGWak3EjwW2JTf43OfhUR7KQFEWHI5cabplC6G1wQqLtHuAnOg5WoieFddyA10gjM5ow=w1200-h800-p-k-no',
  'https://lh3.googleusercontent.com/grass-cs/AABkmLfHSIz9KptP0YT33wJ_M8zBrWZi3nQU_GNg-HIB5yG4spYlrX2a6luz6mCcdczn_9Ju3xS2yBVvDPS2yN9Mi-wHJrkorFeGOweI0LCFLHACclzGDSmdEb6ydJeyEvm75qyneTRw=w1200-h800-p-k-no',
  'https://lh3.googleusercontent.com/grass-cs/AABkmLdJbxwAj7lvLu4XBbxSCVeKBRAn5PVjWxiBwL3xzZJmL0uvLOVcO4j1NyI0y56AHZuLdj9XXXonc_ciD8s3zuAjJHeZnoHy9rPTUT7tbe7Bx2OvzE92GBxp7Z8x11SMWtoAnMNxGA=w1200-h800-p-k-no',
  'https://lh3.googleusercontent.com/grass-cs/AABkmLcFnzvoae5m216gGduodIKJVUUVVUYBZyzVaoNgLdOobOvps5T-Oy_Lh1fYtp2uxhP-XJMKw-gkeDPy4LGioviYV5JOteUOYnNe9GKcJXMsel1ZzMHmyI2T-ksnS35NTsIQN9GVdx4_ZmUQ=w1200-h800-p-k-no'
];

async function updateLead1Assets() {
  console.log('Classifying candidate photos for La Fumee...');
  const classified = await mapsPhotoPipeline.classifyPhotos(candidates, 'La Fumee', 'Cafe & Restaurant');
  
  const agencySiteDir = path.join(process.cwd(), 'web-dev-agency', 'public', 'sites', 'lafumee');
  const clientSiteDir = path.join(process.cwd(), 'generated_sites', '202');
  const reportsDir = path.join(process.cwd(), 'reports', '202');

  // Clean old bad hero.jpg & gallery-1.jpg
  [agencySiteDir, clientSiteDir, reportsDir].forEach(dir => {
    const assetsDir = path.join(dir, 'assets');
    if (fs.existsSync(assetsDir)) {
      ['hero.jpg', 'gallery-1.jpg'].forEach(badFile => {
        const p = path.join(assetsDir, badFile);
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
          console.log(`Deleted discarded file: ${p}`);
        }
      });
    }
  });

  const agencyManifest = await mapsPhotoPipeline.downloadAndStageAssets(classified, agencySiteDir);
  await mapsPhotoPipeline.downloadAndStageAssets(classified, clientSiteDir);
  await mapsPhotoPipeline.downloadAndStageAssets(classified, reportsDir);

  fs.writeFileSync(path.join(reportsDir, 'photos_manifest.json'), JSON.stringify(agencyManifest, null, 2), 'utf8');
  console.log('✅ Photos manifest updated in reports/202/photos_manifest.json:');
  console.log(JSON.stringify(agencyManifest, null, 2));
}

updateLead1Assets().catch(console.error);
