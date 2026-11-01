import 'dotenv/config';

async function pruneDeployments() {
    const token = process.env.VERCEL_TOKEN;
    const projectId = 'prj_bDQewUJReqeKlYBNwvDPcO6vamOZ';
    const teamId = 'team_7pHeotFcK2tW9w7oom9czThz';
    
    console.log('[PRUNE] Fetching project info...');
    const pRes = await fetch(`https://api.vercel.com/v9/projects/${projectId}?teamId=${teamId}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const project = await pRes.json();
    const prodId = project.targets?.production?.id;
    console.log(`[PRUNE] Production deployment ID: ${prodId} (PROTECTED)`);

    // Fetch all deployments
    let allDeployments = [];
    let until = null;
    while (true) {
        let url = `https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=100`;
        if (until) url += `&until=${until}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!data.deployments || data.deployments.length === 0) break;
        allDeployments.push(...data.deployments);
        if (data.pagination?.next) {
            until = data.pagination.next;
        } else {
            break;
        }
    }
    console.log(`[PRUNE] Found ${allDeployments.length} total deployments.`);

    // Keep the latest 10 deployments, delete the rest
    const KEEP_COUNT = 10;
    const toKeep = new Set(allDeployments.slice(0, KEEP_COUNT).map(d => d.uid));
    if (prodId) toKeep.add(prodId);

    const toDelete = allDeployments.filter(d => !toKeep.has(d.uid) && d.state !== 'DELETED');
    console.log(`[PRUNE] Keeping ${toKeep.size} recent/prod deployments. Deleting ${toDelete.length} old historical deployments...`);

    let deletedCount = 0;
    let failedCount = 0;

    for (const d of toDelete) {
        try {
            const delRes = await fetch(`https://api.vercel.com/v13/deployments/${d.uid}?teamId=${teamId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (delRes.ok) {
                deletedCount++;
                if (deletedCount % 10 === 0 || deletedCount === toDelete.length) {
                    console.log(`[PRUNE] Progress: ${deletedCount}/${toDelete.length} deleted...`);
                }
            } else {
                failedCount++;
            }
        } catch (e) {
            failedCount++;
        }
        // Small delay to prevent rate limits
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`[PRUNE] Complete! Successfully deleted ${deletedCount} deployments (${failedCount} failed).`);
}

pruneDeployments().catch(console.error);

