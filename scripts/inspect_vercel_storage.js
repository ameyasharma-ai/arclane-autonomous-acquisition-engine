import 'dotenv/config';

async function main() {
    const token = process.env.VERCEL_TOKEN;
    const projectId = 'prj_bDQewUJReqeKlYBNwvDPcO6vamOZ';
    const teamId = 'team_7pHeotFcK2tW9w7oom9czThz';
    
    // Fetch deployments in reverse (oldest first or get last page)
    const res = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=100`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    const next = data.pagination?.next;
    const res2 = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=100&until=${next}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data2 = await res2.json();
    const oldest = data2.deployments[data2.deployments.length - 1];
    console.log('Oldest deployment:', oldest.uid, new Date(oldest.createdAt).toISOString(), oldest.url);
}

main().catch(console.error);
