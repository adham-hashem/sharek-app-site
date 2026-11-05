export type DeviceBinding={installationId:string;bindingId:string;userId:string;secret:string;token:string;revision:number};
export type NativePushState='unavailable'|'not-configured'|'permission-denied'|'registering'|'registered'|'offline'|'error';
export type NativeAction={notification_id:string;recipient_id:string;binding_id:string;related_type:string;related_id:string;request_id?:string;requester_id?:string;meal_id?:string;action_type?:'accept_help'};
type Ports={prepare:(userId:string)=>Promise<DeviceBinding>;register:(binding:DeviceBinding)=>Promise<boolean>;acknowledge:(binding:DeviceBinding)=>Promise<void>;revoke:(binding:DeviceBinding)=>Promise<void>;clear:()=>Promise<void>};
export function createPushController(ports:Ports){
 let generation=0,owner:string|null=null,pending:Promise<void>|null=null;
 return {
  async sync(userId:string){
   if(owner!==userId){generation++;owner=userId;}
   const turn=generation;if(pending)await pending.catch(()=>{});if(turn!==generation)return;
   const work=(async()=>{const binding=await ports.prepare(userId);if(turn!==generation||owner!==userId)return;
    if(binding.userId!==userId)throw new Error('BINDING_CHANGED');
    if(!await ports.register(binding))throw new Error('DEVICE_NOT_REGISTERED');
    if(turn!==generation||owner!==userId){await ports.revoke(binding);return;}
    await ports.acknowledge(binding);
   })();pending=work;try{await work;}finally{if(pending===work)pending=null;}
  },
  async clear(){generation++;owner=null;await ports.clear();},
 };
}
const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function validNativeAction(value:unknown,userId:string):value is NativeAction {
 const action=value as NativeAction|null;return Boolean(action&&action.recipient_id===userId&&uuid(action.notification_id)&&uuid(action.binding_id)&&uuid(action.related_id)&&['meal_request','meal','chat','community','app_update','marketplace','marketplace_message'].includes(action.related_type)&&(!action.requester_id||uuid(action.requester_id))&&(!action.action_type||(action.action_type==='accept_help'&&action.related_type==='meal_request'&&action.request_id===action.related_id)));
}
