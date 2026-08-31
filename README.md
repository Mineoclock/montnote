# Montnote

基于阿里云OSS对象存储的PWA笔记应用

在线地址：https://mineoclock.github.io/montnote

每一条笔记都是一个OSS文件

开启时，配置OSS目录和accessKey（均本地存储）

建议对accessKey配置RAM Policy
```
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "oss:ListObjects",
      "Resource": "acs:oss:*:*:montnote-chengdu-safe",
      "Condition": {
        "StringLike": {
          "oss:Prefix": [
            "wjs",
            "wjs/*"
          ]
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "oss:GetObject",
        "oss:PutObject",
        "oss:DeleteObject"
      ],
      "Resource": "acs:oss:oss-*:*:montnote-chengdu-safe/wjs/*"
    }
  ]
}
```

