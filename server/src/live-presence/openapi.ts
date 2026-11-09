import { z } from 'zod';
import { presenceStartSchema, presenceHeartbeatSchema, presenceLeaseSchema, directoryEntrySchema, liveDirectorySchema } from './contracts.js';
export function addLivePresenceOpenApi(doc: any) {
    const schemas = { LivePresenceStart: presenceStartSchema, LivePresenceHeartbeat: presenceHeartbeatSchema, LivePresenceLease: presenceLeaseSchema, LiveDirectoryEntry: directoryEntrySchema, LiveDirectory: liveDirectorySchema };
    for (const [name, value] of Object.entries(schemas)) {
        const { $schema, ...schema } = z.toJSONSchema(value);
        doc.components.schemas[name] = schema;
    }
    const ref = (name: string) => ({ $ref: '#/components/schemas/' + name });
    const response = (name: string) => ({ description: 'Success', content: { 'application/json': { schema: ref(name) } } });
    const errors = Object.fromEntries([400, 401, 404, 409, 429, 500].map(code => [code, { description: 'Error envelope', content: { 'application/json': { schema: ref('Error') } } }]));
    const operation = (operationId: string, out: string, input?: string) => ({ operationId, security: [{ desktopSession: [] }], ...(input ? { requestBody: { required: true, content: { 'application/json': { schema: ref(input) } } } } : {}), responses: { 200: response(out), ...errors } });
    doc.paths['/me/live-presence'] = { post: { ...operation('startLivePresence', 'LivePresenceLease', 'LivePresenceStart'), description: '90 second session lease; same active connectionId is idempotent without extending expiry. Stopped or superseded IDs remain retired for the session lifetime and return 409 PRESENCE_LEASE_CLOSED. New connection replaces the session lease. No plan restriction or ownership verification.' } };
    const parameters = [{ name: 'connectionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }];
    doc.paths['/me/live-presence/{connectionId}'] = { put: { ...operation('heartbeatLivePresence', 'LivePresenceLease', 'LivePresenceHeartbeat'), parameters, description: 'Matching active unexpired lease only; missing/stopped/expired returns 404 PRESENCE_LEASE_EXPIRED. Older/equal sequence returns existing lease without mutation or expiry refresh.' }, delete: { operationId: 'stopLivePresence', security: [{ desktopSession: [] }], parameters, responses: { 204: { description: 'Matching lease stopped; stale stop leaves newer lease unchanged. ID is retired even before its POST arrives.' }, ...errors } } };
    doc.paths['/live/active'] = { get: { ...operation('listActiveLiveDirectory', 'LiveDirectory'), description: 'Up to 50 unique lowercase channels from eligible leases, latest report per channel; viewers descending, null last, username ascending ties. Filters revoked/expired sessions and disabled/merged accounts. Only public channel fields; never sums viewers.' } };
    return doc;
}
