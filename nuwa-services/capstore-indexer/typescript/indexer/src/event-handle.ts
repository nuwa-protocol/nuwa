import axios from "axios";
import yaml from "js-yaml";
import {queryLastRegisterEventCursor,
   queryLastUpdateCursor, saveCapToSupabase, saveRegisterEventCursor, saveUpdateEventCursor} from './supabase.js';
import { RoochClient } from '@roochnetwork/rooch-sdk';
import { IPFS_GATEWAY, PACKAGE_ID, ROOCH_NODE_URL } from "./constant.js";

/**
 * Fetches and parses YAML content from IPFS using the provided CID
 * @param cid - Content Identifier for the YAML file on IPFS
 * @returns Parsed YAML data as a JavaScript object
 * @throws Error if IPFS request fails or YAML parsing fails
 */
export async function fetchAndParseYaml(cid: string): Promise<any> {
  try {
    // Use IPFS API endpoint to retrieve content
    const url = `${IPFS_GATEWAY}/api/v0/cat?arg=${cid}`;
    
    const response = await axios.post(url, null, { 
      timeout: 10000,
      responseType: 'text',
      responseEncoding: 'utf8'
    });

    if (response.status !== 200) {
      throw new Error(`IPFS request failed with status ${response.status}`);
    }

    const content = response.data;
    const parsedData = yaml.load(content);

    return parsedData;
  } catch (error) {
    throw new Error(`Failed to fetch or parse YAML: ${(error as Error).message}`);
  }
}

/**
 * Synchronizes a CAP (Capability) by fetching its data from IPFS and storing it to the database
 * @param cid - Content Identifier for the CAP data on IPFS
 * @throws Error if fetching from IPFS or storing to database fails
 */
export async function syncCap(cid: string): Promise<any> {
  try {
    const yamlData = await fetchAndParseYaml(cid);
    await saveCapToSupabase(yamlData, cid, 0);
  } catch(e: any) {
    throw new Error(`Failed to sync CapStore: ${(e as Error).message}`);
  }
}

/**
 * Processes Rooch RegisterEvent events from the blockchain
 * Fetches events from the last known cursor, processes each event by syncing CAP data,
 * and updates the cursor only after all events are successfully processed
 * @returns Promise with the query result containing processed events
 * @throws Error if event querying or processing fails
 */
export async function processRoochRegisterEvent() {
  try {
    const client = new RoochClient({url: ROOCH_NODE_URL});
    const lastCursor = await queryLastRegisterEventCursor();
    const events = await client.queryEvents({
      filter: {
        event_type: `${PACKAGE_ID}::acp_registry::RegisterEvent`,
      },
      cursor: lastCursor || undefined,
      limit: '3',
      queryOption: {
        decode: true,
        showDisplay: true,
        descending: false
      }
    });

    // Process all events, only update cursor if all succeed
    const processedEvents = [];
    for (const event of events.data) {
      const data = (event.decoded_event_data as any)?.value as any;
      if (typeof data.cid !== 'string') {
          throw new Error('Event data does not contain a valid CID string');
      }
      const cid = data.cid;
      const id = data.cap_uri;
      
      console.log(`Processing event with CID: ${cid}, CAP ID: ${id}`);

      try {
        const yamlData = await fetchAndParseYaml(cid);
        await saveCapToSupabase(yamlData, cid, 0);
      } catch (e) {
        processedEvents.push(cid);
        console.log(`dirty data ${cid} `, e.message)
      }
      
      processedEvents.push(cid);
      console.log(`Successfully processed CID: ${cid}`);
    }

    // Only update cursor if all events were processed successfully
    if (events.data.length > 0 && events.next_cursor) {
      await saveRegisterEventCursor(events.next_cursor);
      console.log(`Updated cursor after processing ${processedEvents.length} events: ${processedEvents.join(', ')}`);
    } else if (events.data.length > 0) {
      console.log(`Processed ${processedEvents.length} events but no new cursor to save`);
    } else {
      console.log('No events to process');
    }

    return events;
  } catch (error) {
    console.error(`Error in processRoochRegisterEvent: ${(error as Error).message}`);
    throw new Error(`Rooch event query failed: ${(error as Error).message}`);
  }
}


/**
 * Processes Rooch UpdateEvent events from the blockchain
 * Fetches update events from the last known cursor, processes each event by syncing updated CAP data,
 * and updates the cursor only after all events are successfully processed
 * @returns Promise with the query result containing processed update events
 * @throws Error if event querying or processing fails
 */
export async function processRoochUpdateEvent() {
  try {
    const client = new RoochClient({url: ROOCH_NODE_URL});
    const lastCursor = await queryLastUpdateCursor();
    const events = await client.queryEvents({
      filter: {
        event_type: `${PACKAGE_ID}::acp_registry::UpdateEvent`,
      },
      cursor: lastCursor || undefined,
      limit: '3',
      queryOption: {
        decode: true,
        showDisplay: true,
        descending: false
      }
    });

    // Process all events, only update cursor if all succeed
    const processedEvents = [];
    for (const event of events.data) {
      const data = (event.decoded_event_data as any)?.value as any;
      if (typeof data.cid !== 'string') {
          throw new Error('Event data does not contain a valid CID string');
      }
      const cid = data.cid;
      const version = data.version as number;
      
      console.log(`Processing update event with CID: ${cid}, CAP ID: ${data.cap_uri}, Version: ${version}`);
      
      try {
        const yamlData = await fetchAndParseYaml(cid);
        await saveCapToSupabase(yamlData, cid, version);
      } catch (e) {
        processedEvents.push(cid);
        console.log(`dirty data ${cid} `, e.message)
      }
      
      processedEvents.push(cid);
      console.log(`Successfully processed update CID: ${cid}`);
    }

    // Only update cursor if all events were processed successfully
    if (events.data.length > 0 && events.next_cursor) {
      console.log('update-next',events.next_cursor)
      await saveUpdateEventCursor(events.next_cursor);
      console.log(`Updated update cursor after processing ${processedEvents.length} events: ${processedEvents.join(', ')}`);
    } else if (events.data.length > 0) {
      console.log(`Processed ${processedEvents.length} update events but no new cursor to save`);
    } else {
      console.log('No update events to process');
    }

    return events;
  } catch (error) {
    console.error(`Error in processRoochUpdateEvent: ${(error as Error).message}`);
    throw new Error(`Rooch event query failed: ${(error as Error).message}`);
  }
}

/**
 * Sets up a periodic event listener that continuously polls Rooch blockchain for new events
 * Processes both RegisterEvent and UpdateEvent types at the specified interval
 * @param interval - Polling interval in milliseconds (default: 5000ms)
 */
export function setupRoochEventListener(interval = 5000) {
  setInterval(async () => {
    try {
      console.log("Checking Rooch for new Events...");
      await processRoochRegisterEvent();
      await processRoochUpdateEvent();
    } catch (error) {
      console.error(`Event polling error: ${(error as Error).message}`);
    }
  }, interval);
}