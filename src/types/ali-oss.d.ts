declare module 'ali-oss' {
  interface OssOptions {
    region: string
    bucket: string
    accessKeyId: string
    accessKeySecret: string
    secure?: boolean
  }

  const OSS: {
    new(options: OssOptions): unknown
  }

  export default OSS
}
