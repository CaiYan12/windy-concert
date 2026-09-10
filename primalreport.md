# Windy Concert 本地音乐播放器需求分析与产品规划报告

## 1. 项目概述

### 1.1 项目名称

**Windy Concert**

### 1.2 产品定位

Windy Concert 是一款面向桌面端的现代化本地音乐播放器。

产品体验参考：

- Spotify
- 网易云音乐
- Apple Music
- MusicBee
- foobar2000

但初期不提供商业流媒体音乐服务，而是围绕：

> **本地音乐库 + 现代播放器体验 + 自动音乐信息整理 + 个性化音乐管理**

展开。

Windy Concert 不应被设计为一个单纯的“打开 MP3 文件播放”的播放器，而应该逐步发展为一个：

> **Personal Music Library Manager + Player**

即：

**个人音乐库管理器 + 播放器。**

用户只需要告诉 Windy Concert：

> “我的音乐放在这些文件夹。”

之后系统应自动完成：

```text
指定音乐目录
    ↓
递归扫描
    ↓
识别音频文件
    ↓
读取本地 Metadata
    ↓
读取内嵌封面
    ↓
分析音频
    ↓
建立音乐数据库
    ↓
发现缺失信息
    ↓
联网查询
    ↓
匹配歌曲 / 艺术家 / 专辑
    ↓
补充封面 / 年份 / 流派等 Metadata
    ↓
生成：
歌曲库
艺术家库
专辑库
播放列表
收藏
最近播放
```

最终用户面对的不是：

```text
D:\Music\周杰伦\七里香\01.mp3
```

而是：

```text
七里香
周杰伦
《七里香》
2004

[专辑封面]

FLAC
44.1 kHz
16 bit
999 kbps
```

这应当是 Windy Concert 的核心产品思想。

---

# 2. 项目目标

Windy Concert 第一阶段需要解决五个核心问题。

## 2.1 音乐在哪里

用户可以配置：

```text
D:\Music
E:\网易云下载
F:\Lossless
```

系统递归扫描所有子目录。

例如：

```text
D:\Music
├─ 周杰伦
│  ├─ 七里香
│  │  ├─ 七里香.flac
│  │  ├─ 借口.flac
│  │  └─ cover.jpg
│  └─ 范特西
│
├─ Taylor Swift
│
└─ Aimer
```

程序应自动发现所有音乐。

---

# 3. 核心设计原则

Windy Concert 建议坚持六个原则。

## 3.1 Local First

即使：

- 没有网络
- MusicBrainz 不可用
- Last.fm API 失效
- 元数据服务器超时

用户依然必须能够：

```text
扫描音乐
播放音乐
搜索音乐
收藏歌曲
创建歌单
查看专辑
查看艺术家
```

网络只负责：

> **增强体验，而不是维持基本功能。**

---

## 3.2 Metadata First

播放器不应直接围绕“文件”设计。

错误模型：

```text
Player
 └── File
```

应该围绕音乐实体设计：

```text
Track
Artist
Album
Genre
Playlist
Library
```

文件只是 Track 的一个数据来源。

---

## 3.3 数据库与文件系统分离

例如：

```text
D:\Music\a\b\c\01.flac
```

扫描完成后应转换为：

```text
Track
{
    id
    title
    artist_id
    album_id
    duration
    path
    codec
    bitrate
    sample_rate
}
```

以后 UI 查询歌曲应该：

```text
UI
 ↓
Library Service
 ↓
Database
```

而不是不断：

```text
UI
 ↓
遍历硬盘
```

---

## 3.4 播放器核心与 UI 分离

建议：

```text
UI
 │
PlayerStore
 │
PlaybackService
 │
AudioEngine
```

UI 不直接操作底层音频 API。

---

## 3.5 外部元数据服务必须插件化

不要：

```text
TrackService
    ↓
MusicBrainz API
```

而应该：

```text
MetadataService
      │
      ├── LocalTagProvider
      ├── MusicBrainzProvider
      ├── AcoustIDProvider
      ├── CoverArtProvider
      └── LastFmProvider
```

以后增加：

```text
NeteaseProvider
SpotifyProvider
DiscogsProvider
FanartProvider
LyricsProvider
```

无需修改核心音乐库。

---

# 4. 音乐数据模型

这是整个项目最重要的设计之一。

至少需要以下实体。

---

# 4.1 Track

歌曲。

```text
Track

id
title

artistId
albumId

albumArtist
trackNumber
discNumber

year
genre

duration

filePath
fileSize

format
codec
bitrate
sampleRate
bitDepth
channels

coverId

musicBrainzId
acoustId

dateAdded
lastPlayedAt
playCount

favorite
rating

createdAt
updatedAt
```

---

# 4.2 Artist

```text
Artist

id
name

sortName

avatar
background

musicBrainzId

description

trackCount
albumCount
```

---

# 4.3 Album

```text
Album

id
title

artistId

year
genre

coverId

musicBrainzId

discCount
trackCount
```

---

# 4.4 Playlist

```text
Playlist

id
name

description
cover

createdAt
updatedAt
```

---

# 4.5 PlaylistTrack

解决：

```text
Playlist N : N Track
```

关系。

```text
PlaylistTrack

playlistId
trackId
position
addedAt
```

---

# 4.6 Favorite

初期可以直接：

```text
Track.favorite
```

后期建议独立：

```text
Favorite

entityType
entityId
createdAt
```

这样可以支持：

```text
喜欢歌曲
喜欢专辑
喜欢艺术家
```

---

# 4.7 PlayHistory

```text
PlayHistory

id
trackId
playedAt
playedDuration
completed
```

用于：

```text
最近播放
播放次数
常听歌曲
年度统计
推荐系统
```

---

# 4.8 LibraryFolder

用户配置的音乐目录。

```text
LibraryFolder

id
path

enabled
recursive

lastScanAt
```

---

# 5. 本地音乐扫描系统

这是 P0 级功能。

建议建立：

```text
LibraryScanner
```

流程：

```text
Music Folder
      ↓
File Walker
      ↓
Format Filter
      ↓
Metadata Parser
      ↓
Track Matcher
      ↓
Database Upsert
      ↓
Cover Extractor
      ↓
Library Updated
```

---

# 5.1 文件夹管理

用户可以：

```text
添加音乐目录
删除目录
临时禁用目录
重新扫描
```

例如：

```text
音乐库目录

✓ D:\Music
✓ E:\Lossless
□ F:\Archive
```

---

# 5.2 递归扫描

必须支持任意目录结构。

例如：

```text
Music
 └─ Artist
     └─ Album
         └─ Disc
             └─ Song.flac
```

目录层级不能被写死。

---

# 5.3 增量扫描

第一次：

```text
30,000 Tracks
```

可以完整扫描。

以后不能每次启动都重新解析 30,000 个文件。

保存：

```text
path
size
modifiedTime
```

如果均未变化：

```text
Skip
```

如果变化：

```text
Reparse
```

---

# 5.4 文件删除检测

如果：

```text
D:\Music\a.flac
```

已经不存在：

```text
Track
status = missing
```

建议不要立即删除数据库记录。

否则移动硬盘暂时断开时：

```text
整个音乐库消失
```

体验非常差。

推荐：

```text
available
missing
ignored
```

三种状态。

---

# 6. 音频格式支持

播放器底层不建议自行实现 Decoder。

可以选择 FFmpeg 或调用成熟系统音频框架。

FFmpeg 当前可以处理非常广泛的容器和编解码格式，并可以通过自身能力枚举支持的 formats/codecs，因此非常适合承担 Windy Concert 的格式兼容层。citeturn609831search2

优先支持：

```text
MP3
FLAC
WAV
AAC
M4A
OGG
OPUS
WMA
AIFF
APE
ALAC
```

后续：

```text
DSF
DFF
WV
TTA
AC3
MKA
```

---

# 7. Metadata 系统

Metadata 应当分成：

```text
Local Metadata

Remote Metadata
```

---

# 7.1 Local Metadata

优先读取：

```text
ID3
Vorbis Comment
FLAC Metadata
MP4 Metadata
APEv2
```

字段包括：

```text
Title
Artist
Album
Album Artist
Track Number
Disc Number
Genre
Year
Composer
Comment
Lyrics
Cover
```

优先级必须遵循：

```text
文件内 Metadata
       ↓
文件夹 Metadata
       ↓
网络 Metadata
       ↓
文件名猜测
```

而不是网络数据覆盖用户自己的标签。

---

# 7.2 本地封面发现

优先：

```text
Embedded Cover
```

其次寻找：

```text
cover.jpg
cover.png
folder.jpg
folder.png
front.jpg
album.jpg
```

例如：

```text
Album
├─ 01.flac
├─ 02.flac
└─ cover.jpg
```

整个 Album 可以复用。

---

# 8. 在线 Metadata 增强系统

建议采用 Provider 架构。

```text
MetadataResolver

    ├── MusicBrainz
    ├── AcoustID
    ├── Cover Art Archive
    └── Last.fm
```

---

# 8.1 MusicBrainz

推荐作为：

> **音乐实体标准数据库。**

MusicBrainz API 本身就是面向媒体播放器、Tagger 等应用设计的，可以查询 Artist、Recording、Release、Release Group、Genre、Work 等核心实体，并支持 MBID、ISRC 等标识。citeturn609831search3

例如：

```text
Track
 ↓
Recording

Album
 ↓
Release

Artist
 ↓
Artist
```

Windy Concert 应尽量保存：

```text
musicBrainzRecordingId
musicBrainzReleaseId
musicBrainzArtistId
```

以后可以作为不同 Metadata Provider 之间的公共 ID。

---

# 8.2 Cover Art Archive

MusicBrainz 匹配成功：

```text
Release MBID
      ↓
Cover Art Archive
      ↓
Album Cover
```

Cover Art Archive 可以直接通过 release 或 release-group 的 MBID 获取封面，并提供不同尺寸缩略图。citeturn609831search1

适合：

```text
专辑封面
```

---

# 8.3 Last.fm

可以作为增强源。

例如：

```text
Artist
Album
Track
Tags
Biography
```

Last.fm 官方 API 可以根据 Artist + Album、Artist + Track 或 MusicBrainz ID 查询音乐信息。citeturn609831search4turn609831search5

可用于：

```text
艺术家介绍
歌曲 Tags
类似艺术家
热门歌曲
```

但不应该成为主数据库。

---

# 9. 无 Metadata 音乐识别

这是 Windy Concert 比普通本地播放器更“智能”的重要能力。

例如用户拥有：

```text
Track01.flac
```

Tag：

```text
Title = ""
Artist = ""
Album = ""
```

仅靠文件名完全不知道是什么。

此时：

```text
Audio
 ↓
Chromaprint
 ↓
Audio Fingerprint
 ↓
AcoustID
 ↓
MusicBrainz ID
 ↓
MusicBrainz
 ↓
Track Metadata
```

Chromaprint 是客户端音频指纹算法；AcoustID Web Service 可以根据该指纹寻找对应记录并返回关联的 MusicBrainz 信息。citeturn909709search1turn909709search2

于是：

```text
Track01.flac
```

可能自动变成：

```text
夜曲
周杰伦
十一月的萧邦
2005
```

这将是 Windy Concert 很有价值的一项差异化能力。

但建议放在 **V1.5/V2，而不是 MVP。**

---

# 10. Metadata 匹配置信度

不能简单：

```text
搜到第一条
=
覆盖
```

必须计算：

```text
Match Score
```

例如：

```text
Title similarity       35%
Artist similarity      30%
Album similarity       15%
Duration difference    15%
Track number            5%
```

得到：

```text
96% → 自动采用

81% → 自动采用但标记

62% → 请求用户确认

35% → 不匹配
```

后期加入：

```text
AcoustID
ISRC
MusicBrainz ID
```

后可信度可以显著提高。

---

# 11. Metadata Provenance

这是建议一开始就设计进去、实现成本却很低的高级能力。

例如：

```text
title
value = "夜曲"
source = embedded

album
value = "十一月的萧邦"
source = musicbrainz

cover
source = coverartarchive
```

也就是：

> 每条信息都知道“它从哪里来的”。

以后用户修改信息时，可以：

```text
用户编辑
>
Local Tag
>
MusicBrainz
>
Last.fm
>
Filename Guess
```

解决不同数据源冲突。

---

# 12. 播放器核心

播放器至少拥有：

```text
play()
pause()
stop()

seek()

next()
previous()

setVolume()

setRate()

loadTrack()
```

播放器状态：

```text
PlayerState

currentTrack
duration
position

playing
paused

volume
muted

playMode
```

---

# 13. 播放队列 Queue

非常重要：

> **Playlist 不等于 Queue。**

Playlist：

```text
长期保存的歌曲集合
```

Queue：

```text
当前播放会话的歌曲顺序
```

例如用户：

```text
播放《七里香》
```

实际上生成：

```text
Queue

1 七里香
2 借口
3 外婆
4 将军
...
```

用户点击：

```text
下一首
```

操作的是 Queue。

---

# 14. 播放模式

需要支持：

```text
顺序播放

列表循环

单曲循环

随机播放
```

建议内部：

```text
PlayMode

SEQUENTIAL
REPEAT_ALL
REPEAT_ONE
SHUFFLE
```

---

# 15. 真随机与 Shuffle Queue

不要每次：

```text
random()
```

这样可能：

```text
A
B
A
C
A
```

更合理的是：

```text
Original Queue

A
B
C
D
E

Shuffle
 ↓

C
E
A
D
B
```

然后依次播放。

---

# 16. 喜欢的音乐

用户可以：

```text
♡
→
♥
```

形成系统级：

```text
Liked Songs
```

并支持：

```text
按添加时间
按歌手
按专辑
按歌曲名
按播放次数
```

排序。

---

# 17. 自建歌单

基本操作：

```text
新建歌单

添加歌曲

移除歌曲

拖拽排序

重命名

删除

添加描述

修改封面
```

后期：

```text
多选加入歌单
智能歌单
导入 M3U
导出 M3U
```

---

# 18. 智能歌单

这是非常适合后续实现的功能。

例如：

```text
最近添加

最近播放

播放最多

从未播放

最常听歌手

2020 年以后

FLAC Only

Hi-Res Audio

Rating >= 4
```

本质：

```SQL
SELECT Track
WHERE ...
```

实现成本并没有想象中高。

---

# 19. 音乐库首页

建议参考 Spotify / 网易云，而不是文件管理器。

首页：

```text
Good Afternoon

最近播放

最近添加

最常听专辑

最常听艺术家

我的歌单

喜欢的音乐
```

---

# 20. Songs 页面

列表：

```text
#   Title             Album           Artist        Time

1   夜曲              十一月的萧邦     周杰伦         3:46
2   七里香            七里香           周杰伦         4:59
```

可显示：

```text
Cover
Title
Artist
Album
Genre
Year
Duration
Format
Bitrate
```

支持排序：

```text
Title
Artist
Album
Date Added
Year
Duration
Play Count
```

---

# 21. Album 页面

```text
[Cover]

十一月的萧邦

周杰伦

2005 · 12 Songs

♡ Play Shuffle

01 夜曲
02 蓝色风暴
03 发如雪
...
```

---

# 22. Artist 页面

```text
[Artist Image]

周杰伦

125 Songs
14 Albums

Popular

Albums

All Songs
```

---

# 23. 全局搜索

需要搜索：

```text
Track
Artist
Album
Playlist
```

初期：

```text
LIKE / FTS
```

即可。

后期：

```text
拼音
模糊搜索
别名
简繁体
日文罗马音
```

---

# 24. 播放栏

Spotify 风格：

```text
┌────────────────────────────────────────────────────┐
│ Cover │ Track / Artist │ ◀  ▶  ▶ │ Progress │ 🔊 │
└────────────────────────────────────────────────────┘
```

核心：

```text
Cover
Title
Artist

Favorite

Previous
Play/Pause
Next

Shuffle
Repeat

Progress
Current Time
Duration

Volume
Queue
```

---

# 25. Now Playing 页面

后续提供沉浸式界面：

```text
                    Cover

               七里香

               周杰伦


              Lyrics
```

背景：

```text
封面主色提取
+
Blur
+
Gradient
```

---

# 26. 歌词系统

建议独立：

```text
LyricsService
```

支持：

```text
Embedded Lyrics

.lrc

Remote Lyrics
```

数据：

```text
Lyrics

trackId
type

plainText

timedLines
source
```

例如：

```text
[00:18.210]窗外的麻雀
[00:20.140]在电线杆上多嘴
```

---

# 27. 音量与音频控制

MVP：

```text
音量
静音
系统输出设备
```

后期：

```text
Equalizer
ReplayGain
Crossfade
Gapless Playback
Exclusive Mode
Audio Device Selection
```

---

# 28. Gapless Playback

无缝播放。

对于：

```text
Live Album
Classical
DJ Mix
Concept Album
```

非常重要。

例如：

```text
Track A
████████████████

Track B
████████████████
```

之间不能出现：

```text
200ms silence
```

这个功能涉及播放缓冲和音频后端，因此属于中后期。

---

# 29. ReplayGain

解决：

```text
Song A：特别响
Song B：特别小
```

需要：

```text
Track Gain
Album Gain
```

后期可以分析本地文件：

```text
LUFS
True Peak
ReplayGain
```

统一听感音量。

---

# 30. 文件变化监听

扫描之后：

```text
D:\Music
```

用户可能添加：

```text
new-song.flac
```

系统可以使用 File Watcher：

```text
Created
Modified
Deleted
Renamed
```

实时更新 Library。

但建议：

```text
Watcher
+
定期完整校验
```

而不能完全依赖 Watcher。

---

# 31. 缓存系统

需要：

```text
Image Cache
Metadata Cache
Waveform Cache
Fingerprint Cache
```

例如封面：

```text
Original:
2000 × 2000

Cache:
64 × 64
256 × 256
512 × 512
```

列表页不能每次加载原图。

---

# 32. 设置系统

Settings：

```text
General

Library

Playback

Audio

Metadata

Appearance

Cache

About
```

Library：

```text
Music Folders

Automatically scan

Watch folders
```

Metadata：

```text
Automatically fetch metadata

Automatically fetch covers

Prefer local metadata

Enable MusicBrainz

Enable Last.fm
```

---

# 33. 推荐系统

不建议 MVP 实现。

但是数据库应该提前保留：

```text
playCount
skipCount
favorite
lastPlayed
playHistory
rating
genre
artist
```

未来可以生成：

```text
猜你喜欢

最近常听

很久没听

相似歌曲

Daily Mix
```

之后甚至可以加入：

```text
Audio Embedding
+
User Preference Embedding
```

做真正的本地推荐。

---

# 34. 系统模块划分

推荐整体架构：

```text
                WINDY CONCERT

┌─────────────────────────────────┐
│                UI               │
│                                 │
│ Home Songs Albums Artists       │
│ Playlist Search NowPlaying      │
└───────────────┬─────────────────┘
                │
          Application Layer
                │
 ┌──────────────┼───────────────┐
 │              │               │
Library       Player         Playlist
Service       Service        Service
 │              │               │
 │              │               │
Metadata      Queue           Favorite
Service       Service         Service
 │
Scanner
 │
────────────────────────────────────
Infrastructure
────────────────────────────────────
 │
 ├── Database
 │
 ├── File System
 │
 ├── Audio Engine
 │
 ├── FFmpeg
 │
 ├── MusicBrainz
 │
 ├── AcoustID
 │
 └── Cover Art Archive
```

核心原则：

> **UI 不知道 FFmpeg，播放器不知道 MusicBrainz，Metadata 系统不知道 Playlist。**

---

# 35. 功能优先级总表

综合考虑：

- 易实现程度
- 独立性
- 用户价值
- 后续扩展能力

建议按照以下顺序开发。

---

## Level 1：★★★★★ 最容易、最解耦、收益最高

### P0 基础框架

```text
应用 Shell
页面路由
数据库
统一数据模型
Settings
```

难度：

★☆☆☆☆

耦合：

★☆☆☆☆

---

## Level 2：★★★★★

### Library Folder

```text
添加音乐目录
删除音乐目录
保存配置
递归目录
```

难度：

★☆☆☆☆

---

## Level 3：★★★★★

### Local Scanner

```text
文件扫描
格式过滤
增量扫描
```

难度：

★★☆☆☆

这是整个系统第一个真正核心能力。

---

## Level 4：★★★★★

### Local Metadata

```text
歌曲名
艺术家
专辑
年份
流派
封面
Audio Info
```

难度：

★★☆☆☆

进步性：

★★★★★

因为：

> 一旦 Metadata 层正确，Album / Artist / Search 基本自然形成。

---

# 36. 第二阶段：播放器

## Level 5

### Audio Engine

```text
Play
Pause
Seek
Volume
Duration
```

难度：

★★☆☆☆

耦合：

★★☆☆☆

---

## Level 6

### Player State

```text
currentTrack

position

duration

playing
```

UI：

```text
Player Bar
```

---

## Level 7

### Queue

```text
Queue
Next
Previous
Shuffle
Repeat
```

难度：

★★★☆☆

重要程度：

★★★★★

---

# 37. 第三阶段：现代音乐库

建议顺序：

```text
Songs
 ↓
Albums
 ↓
Artists
 ↓
Search
```

这些主要依赖：

```text
Database
+
Metadata
```

因此耦合程度仍然较低。

---

# 38. 第四阶段：个人音乐管理

顺序：

```text
Favorite
 ↓
Playlist
 ↓
Recently Played
 ↓
Play Count
 ↓
Smart Playlist
```

难度：

★★☆☆☆ ～ ★★★☆☆

但产品价值：

★★★★★

这是从：

```text
播放器
```

升级成：

```text
个人音乐平台
```

的关键阶段。

---

# 39. 第五阶段：在线 Metadata

依次：

```text
Metadata Provider Interface

↓

MusicBrainz

↓

Cover Art Archive

↓

Last.fm

↓

Metadata Match Engine

↓

Metadata Cache
```

MusicBrainz 很适合作为核心标准化来源；它提供以 MBID 为核心的一套音乐实体体系。Cover Art Archive 可以基于其 Release ID 衔接封面，而 Last.fm 适合承担补充信息角色。citeturn609831search1turn609831search3turn609831search4

难度：

★★★☆☆

网络耦合：

★★★☆☆

因此必须 Provider 化。

---

# 40. 第六阶段：智能歌曲识别

```text
FFmpeg
 ↓
Chromaprint
 ↓
Fingerprint
 ↓
AcoustID
 ↓
MusicBrainz
 ↓
Match Confidence
 ↓
Metadata
```

难度：

★★★★☆

用户体验：

★★★★★

技术亮点：

★★★★★

AcoustID 专门面向完整音频文件识别，并能够将声纹匹配结果关联到 MusicBrainz，因此非常适合处理文件名和标签严重缺失的本地音乐。citeturn909709search1turn909709search3

---

# 41. 第七阶段：高级播放器

开发顺序：

```text
Lyrics

↓

Equalizer

↓

ReplayGain

↓

Gapless

↓

Crossfade

↓

Audio Device Control
```

难度：

★★★★☆

音频 Engine 耦合：

★★★★☆

---

# 42. 第八阶段：智能化

最后才实现：

```text
自动歌单

音乐统计

年度报告

相似歌曲

猜你喜欢

Daily Mix

Audio Embedding

Recommendation Engine
```

难度：

★★★★★

系统耦合：

★★★★★

但这时 Windy Concert 将逐渐从：

```text
Local Music Player
```

变成：

```text
Personal Spotify
```

---

# 43. 最终开发优先级排名

综合“简单 + 高收益 + 高解耦”到“复杂 + 强耦合”排列：

| 排名 | 模块 | 难度 | 解耦性 | 用户价值 |
|---|---|---:|---:|---:|
| 1 | 数据模型 | ★ | ★★★★★ | ★★★★★ |
| 2 | Library Folder | ★ | ★★★★★ | ★★★★ |
| 3 | 文件递归扫描 | ★★ | ★★★★★ | ★★★★★ |
| 4 | 本地 Metadata | ★★ | ★★★★★ | ★★★★★ |
| 5 | 数据库音乐库 | ★★ | ★★★★★ | ★★★★★ |
| 6 | 基础播放 | ★★ | ★★★★ | ★★★★★ |
| 7 | Player State | ★★ | ★★★★ | ★★★★★ |
| 8 | Songs | ★★ | ★★★★★ | ★★★★★ |
| 9 | Albums | ★★ | ★★★★ | ★★★★★ |
| 10 | Artists | ★★ | ★★★★ | ★★★★★ |
| 11 | Search | ★★ | ★★★★ | ★★★★★ |
| 12 | Favorite | ★ | ★★★★★ | ★★★★★ |
| 13 | Playlist | ★★ | ★★★★ | ★★★★★ |
| 14 | Queue | ★★★ | ★★★ | ★★★★★ |
| 15 | Shuffle / Repeat | ★★ | ★★★ | ★★★★★ |
| 16 | Play History | ★★ | ★★★★ | ★★★★ |
| 17 | Smart Playlist | ★★★ | ★★★★ | ★★★★ |
| 18 | File Watcher | ★★★ | ★★★ | ★★★★ |
| 19 | Cover Cache | ★★ | ★★★★ | ★★★★ |
| 20 | MusicBrainz | ★★★ | ★★★★ | ★★★★ |
| 21 | Cover Art Archive | ★★ | ★★★★ | ★★★★ |
| 22 | Last.fm | ★★★ | ★★★★ | ★★★ |
| 23 | Metadata Matching | ★★★★ | ★★★ | ★★★★★ |
| 24 | Lyrics | ★★★ | ★★★ | ★★★★ |
| 25 | Chromaprint | ★★★ | ★★★ | ★★★★ |
| 26 | AcoustID | ★★★★ | ★★★ | ★★★★★ |
| 27 | ReplayGain | ★★★★ | ★★★ | ★★★★ |
| 28 | Gapless | ★★★★ | ★★ | ★★★★ |
| 29 | Crossfade | ★★★★ | ★★ | ★★★ |
| 30 | EQ / DSP | ★★★★ | ★★ | ★★★★ |
| 31 | 智能推荐 | ★★★★★ | ★★ | ★★★★ |
| 32 | Audio Embedding | ★★★★★ | ★★ | ★★★ |
| 33 | 云同步 | ★★★★★ | ★ | ★★★★ |

---

# 44. Windy Concert MVP

真正第一版建议严格控制为：

```text
Windy Concert 0.1

✓ 添加音乐目录

✓ 递归扫描

✓ MP3 / FLAC / WAV / AAC / M4A / OGG / OPUS 等

✓ Metadata

✓ Embedded Cover

✓ Albums

✓ Artists

✓ Songs

✓ Search

✓ Play / Pause

✓ Seek

✓ Volume

✓ Previous / Next

✓ Queue

✓ Shuffle

✓ Repeat

✓ Favorite

✓ Playlist

✓ Recently Played

✓ 本地数据库
```

做到这里：

> Windy Concert 已经是一款真正可以日常使用的本地音乐播放器。

---

# 45. Windy Concert 0.5

增加：

```text
✓ MusicBrainz

✓ Cover Art Archive

✓ Metadata 补全

✓ Metadata Cache

✓ File Watcher

✓ Smart Playlist

✓ Lyrics

✓ Artist Page

✓ Album Page

✓ Now Playing
```

此时开始接近：

> Spotify / 网易云的本地音乐体验。

---

# 46. Windy Concert 1.0

增加：

```text
✓ Chromaprint

✓ AcoustID

✓ 自动歌曲识别

✓ Metadata Match Engine

✓ Metadata 来源管理

✓ ReplayGain

✓ Gapless

✓ EQ

✓ Crossfade

✓ 音频设备选择

✓ 高级音乐库统计
```

此时已经不是简单播放器。

而是：

> **智能本地音乐管理平台。**

---

# 47. Windy Concert 2.0

进一步：

```text
Listening Profile

Recommendation Engine

Daily Mix

Favorite Artist Modeling

Audio Features

Audio Embedding

Similarity Search

Auto Playlist

Music Statistics

Year in Review
```

最终：

```text
                        WINDY CONCERT

                            │
          ┌─────────────────┴─────────────────┐

      Local Music                      User Library
          │                                  │
   Scanner / Watcher               Favorite / Playlist
          │                                  │
     Metadata                               History
          │                                  │
  ┌───────┴────────┐                         │
Local            Online                      │
Metadata        Metadata                     │
                 │                           │
        ┌────────┼─────────┐                 │
   MusicBrainz AcoustID CoverArt             │
        │                                    │
        └─────────────┬──────────────────────┘
                      │
                 Music Database
                      │
        ┌─────────────┼─────────────┐
        │             │             │
      Album         Artist         Track
        │             │             │
        └─────────────┼─────────────┘
                      │
                 Playback Queue
                      │
                  Audio Engine
                      │
                     DSP
                      │
                  Audio Device
```

---

# 48. 项目最重要的架构边界

Windy Concert 最容易出现的错误，是早期为了实现方便写成：

```text
UI
 ↓
扫描文件
 ↓
读取 Tags
 ↓
调用 MusicBrainz
 ↓
播放
```

这会迅速形成巨型耦合。

正确架构应该是：

```text
                   UI
                    │
             Application API
                    │
      ┌─────────────┼──────────────┐
      │             │              │
   Library        Player       User Library
      │             │              │
 Scanner        Playback       Playlist
 Metadata       Queue          Favorite
      │             │
 Providers      AudioEngine
      │             │
 Internet         FFmpeg
```

六个边界务必保持：

```text
UI ≠ Player

Player ≠ Queue

Queue ≠ Playlist

Track ≠ File

Metadata ≠ Track

Remote Metadata ≠ Local Library
```

如果这几个边界从 V0.1 就建立正确，未来 Windy Concert 从：

```text
1000 行
```

成长到：

```text
10 万行
```

依然有比较好的可维护性。

---

# 49. 最值得提前设计的五个能力

有些功能暂时不用实现，但数据结构最好提前留下空间。

第一：

```text
Track Stable ID
```

不能把：

```text
File Path
```

作为 Track ID。

否则：

```text
D:\Music\a.flac

移动到：

E:\Music\a.flac
```

系统会认为：

```text
旧歌删除
+
新歌加入
```

导致：

```text
Favorite
Playlist
Play History
```

全部丢失关联。

---

第二：

```text
Metadata Provenance
```

记录 Metadata 来源。

---

第三：

```text
External IDs
```

例如：

```text
MBID
AcoustID
ISRC
```

---

第四：

```text
Play History
```

即使暂时不显示统计，也应尽早收集。

---

第五：

```text
Provider Interface
```

以后任何外部音乐数据服务都接到 Provider Layer。

---

# 50. 产品方向结论

Windy Concert 不应该定义成：

> “一个长得像 Spotify 的本地 MP3 播放器。”

更准确的产品定义是：

> **一个以本地音乐库为核心、能够理解和整理用户音乐收藏，并拥有现代流媒体播放器交互体验的 Personal Music Platform。**

项目的发展路径应当是：

```text
                    Windy Concert

                         │
                    Local Player
                         │
                 Music Library
                         │
               Metadata Manager
                         │
                Personal Library
                         │
               Smart Identification
                         │
               Listening History
                         │
                Music Intelligence
                         │
               Recommendation
```

因此真正值得长期投入建设的并不是单纯的：

```text
播放按钮
```

而是下面四个核心能力：

```text
Library Engine
      +
Metadata Engine
      +
Playback Engine
      +
Personal Music Database
```

只要这四层建立正确，上层的：

```text
Spotify 风 UI

网易云式歌单

歌词

年度报告

猜你喜欢

Daily Mix

艺术家主页

专辑主页

智能歌单
```

都会逐渐变成相对自然的功能扩展。

而如果底层一开始围绕：

```text
文件路径 + 一个 Audio 标签
```

设计，项目做到中期以后几乎必然需要重构。

因此 Windy Concert V0.x 最重要的目标并不是“做最多功能”，而是：

> **建立一套足够稳定的音乐领域模型、Library Engine 和 Playback Engine，使后面的功能可以不断向外添加，而无需反复推翻播放器核心。**