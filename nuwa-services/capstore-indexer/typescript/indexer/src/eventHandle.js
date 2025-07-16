import axios from "axios";
import yaml from "js-yaml";
import { storeToSupabase, queryCIDFromSupabase } from './supabase';
import { RoochClient } from '@roochnetwork/rooch-sdk';
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'https://ipfs.io/ipfs';
const PACKAGE_ID = process.env.PACKAGE_ID || 'YOUR_ROOCH_PACKAGE_ID';
export async function fetchAndParseYaml(cid) {
    try {
        const url = `${IPFS_GATEWAY}/${cid}`;
        const response = await axios.get(url, { timeout: 10000 });
        if (response.status !== 200) {
            throw new Error(`IPFS request failed with status ${response.status}`);
        }
        const content = response.data;
        const parsedData = yaml.load(content);
        if (!parsedData?.name || !parsedData?.id || !parsedData?.cid) {
            throw new Error('Invalid YAML structure: Missing required fields');
        }
        return {
            name: parsedData.name,
            id: parsedData.id,
            cid: parsedData.cid
        };
    }
    catch (error) {
        throw new Error(`Failed to fetch or parse YAML: ${error.message}`);
    }
}
export async function processRoochRegisterEvent() {
    try {
        const client = new RoochClient({ url: 'https://test-seed.rooch.network' });
        const events = await client.queryEvents({
            filter: {
                event_type: `${PACKAGE_ID}::acp_registry::RegisterEvent`,
            }
        });
        for (const event of events.data) {
            try {
                const cid = event.decoded_event_data.cid;
                const yamlData = await fetchAndParseYaml(cid);
                await storeToSupabase(yamlData, cid);
                console.log(`Processed CID: ${cid}`);
            }
            catch (innerError) {
                console.error(`Error processing event: ${innerError.message}`);
            }
        }
        return events;
    }
    catch (error) {
        throw new Error(`Rooch event query failed: ${error.message}`);
    }
}
export async function queryCID(name, id) {
    try {
        if (!name || !id)
            throw new Error('Missing name or id parameter');
        const result = await queryCIDFromSupabase(name, id);
        return {
            success: true,
            cid: result.cid
        };
    }
    catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}
export function setupRoochEventListener(interval = 30000) {
    setInterval(async () => {
        try {
            console.log("Checking Rooch for new RegisterEvents...");
            await processRoochRegisterEvent();
        }
        catch (error) {
            console.error(`Event polling error: ${error.message}`);
        }
    }, interval);
}
