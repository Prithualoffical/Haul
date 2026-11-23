// Loose stand-ins so tsc can check OUR code's structure offline. Real builds use @types/three etc.
declare module 'three' {
  class Any { [k: string]: any; constructor(...a: any[]) }
  export class Vector3 extends Any {} export class Vector2 extends Any {} export class Quaternion extends Any {}
  export class Euler extends Any {} export class Color extends Any {} export class Group extends Any {}
  export class Mesh extends Any {} export class Object3D extends Any {} export class Points extends Any {}
  export class Scene extends Any {} export class PerspectiveCamera extends Any {} export class WebGLRenderer extends Any {}
  export class AmbientLight extends Any {} export class PointLight extends Any {} export class SpotLight extends Any {}
  export class FogExp2 extends Any {} export class Texture extends Any {} export class CanvasTexture extends Texture {}
  export class Material extends Any {} export class MeshBasicMaterial extends Material {} export class MeshStandardMaterial extends Material {}
  export class PointsMaterial extends Material {} export class BufferAttribute extends Any {}
  export class BufferGeometry extends Any {} export class BoxGeometry extends BufferGeometry {} export class PlaneGeometry extends BufferGeometry {}
  export class CylinderGeometry extends BufferGeometry {} export class SphereGeometry extends BufferGeometry {}
  export class ConeGeometry extends BufferGeometry {} export class TorusGeometry extends BufferGeometry {}
  export class CircleGeometry extends BufferGeometry {} export class LatheGeometry extends BufferGeometry {}
  export const ACESFilmicToneMapping: number; export const PCFSoftShadowMap: number;
  export const RepeatWrapping: number; export const SRGBColorSpace: string;
}
declare module 'three/addons/postprocessing/EffectComposer.js' { export class EffectComposer { [k: string]: any; constructor(...a: any[]) } }
declare module 'three/addons/postprocessing/RenderPass.js' { export class RenderPass { constructor(...a: any[]) } }
declare module 'three/addons/postprocessing/UnrealBloomPass.js' { export class UnrealBloomPass { [k: string]: any; constructor(...a: any[]) } }
declare module 'three/addons/postprocessing/ShaderPass.js' { export class ShaderPass { [k: string]: any; constructor(...a: any[]) } }
declare module 'three/addons/postprocessing/OutputPass.js' { export class OutputPass { constructor(...a: any[]) } }
declare module 'cannon-es' {
  class Any { [k: string]: any; constructor(...a: any[]) }
  export class Vec3 extends Any {} export class Body extends Any {} export class Box extends Any {}
  export class Plane extends Any {} export class World extends Any {} export class ContactEquation extends Any {}
}
declare module 'peerjs' {
  export interface DataConnection { peer: string; open: boolean; send(d: unknown): void; on(ev: string, cb: (...a: any[]) => void): void }
  export class Peer { constructor(...a: any[]); on(ev: string, cb: (...a: any[]) => void): void; connect(id: string, o?: unknown): DataConnection }
}
