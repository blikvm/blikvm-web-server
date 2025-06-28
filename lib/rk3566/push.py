import gi
import time
import argparse # 导入 argparse 模块
gi.require_version('Gst', '1.0')
from gi.repository import Gst, GLib
import subprocess
import os

import re

# 初始化GStreamer
Gst.init(None)

# 创建 ArgumentParser 对象
parser = argparse.ArgumentParser(description="GStreamer RTSP 推流程序")

#添加 codec 参数，用于选择编码器
parser.add_argument("--codec", type=str, default="h265", choices=["h264", "h265"],
                    help="视频编码器类型 (h264 或 h265). 默认值: h265")

# 添加 bitrate 参数
parser.add_argument("--bitrate", type=int, default=3000,
                    help="视频编码器的最大比特率 (bps). 默认值: 3000000")
# 添加 gop 参数
parser.add_argument("--gop", type=int, default=60,
                    help="视频编码器的 GOP (Group of Pictures) 大小. 默认值: 60")

# 解析命令行参数
args = parser.parse_args()

print(f"Codec: {args.codec}, gop : {args.gop}: bitrate: {args.bitrate}", flush=True)

# 创建管道
pipeline = Gst.Pipeline.new("mypipeline")

# 创建元素
v4l2src = Gst.ElementFactory.make("v4l2src", "v4l2src")
video_caps = Gst.Caps.from_string("video/x-raw,width=1920,height=1080,framerate=60/1,format=NV12")
video_filter = Gst.ElementFactory.make("capsfilter", "video_filter")
video_filter.set_property("caps", video_caps)

queue1 = Gst.ElementFactory.make("queue", "queue1")
# mpph265enc = Gst.ElementFactory.make("mpph265enc", "mpph265enc")

# 根据命令行参数动态选择和创建视频编码器和解析器
if args.codec == 'h265':
    video_encoder = Gst.ElementFactory.make("mpph265enc", "video_encoder")
    video_parser = Gst.ElementFactory.make("h265parse", "video_parser")
    print("Using H.265 (mpph265enc) encoder.", flush=True)
else: # args.codec == 'h264'
    video_encoder = Gst.ElementFactory.make("mpph264enc", "video_encoder")
    video_parser = Gst.ElementFactory.make("h264parse", "video_parser")
    print("Using H.264 (mpph264enc) encoder.", flush=True)

# 检查编码器是否成功创建
if not video_encoder or not video_parser:
    print(f"Error: Failed to create {args.codec} encoder/parser elements. Check GStreamer installation.", flush=True)
    exit(1)
video_encoder.set_property("qp-init", 50)
video_encoder.set_property("qp-max", 51)
video_encoder.set_property("qp-min", 30)
video_encoder.set_property("rc-mode", 0)
video_encoder.set_property("gop", args.gop)
video_encoder.set_property("bps-max", args.bitrate*1000)
# video_encoder.set_property("gop", args.gop) # 使用解析到的 gop 参数
# video_encoder.set_property("bps", args.bitrate) # 设置目标比特率

queue2 = Gst.ElementFactory.make("queue", "queue2")
# h265parse = Gst.ElementFactory.make("h265parse", "h265parse")
queue3 = Gst.ElementFactory.make("queue", "queue3")

rtspclientsink = Gst.ElementFactory.make("rtspclientsink", "s")
rtspclientsink.set_property("latency", 0)
rtspclientsink.set_property("location", "rtsp://127.0.0.1:8554/test")

alsasrc = Gst.ElementFactory.make("alsasrc", "alsasrc")
alsasrc.set_property("device", "hw:1")
audio_caps = Gst.Caps.from_string("audio/x-raw,rate=48000,channels=2")
audio_filter = Gst.ElementFactory.make("capsfilter", "audio_filter")
audio_filter.set_property("caps", audio_caps)

queue4 = Gst.ElementFactory.make("queue", "queue4")
opusenc = Gst.ElementFactory.make("opusenc", "opusenc")
opusenc.set_property("bitrate", 320000)
opusparse = Gst.ElementFactory.make("opusparse", "opusparse")

# 将元素逐个添加到管道中
pipeline.add(v4l2src)
pipeline.add(video_filter)
pipeline.add(queue1)
pipeline.add(video_encoder)
pipeline.add(queue2)
pipeline.add(video_parser)
pipeline.add(queue3)
pipeline.add(rtspclientsink)
pipeline.add(alsasrc)
pipeline.add(audio_filter)
pipeline.add(queue4)
pipeline.add(opusenc)
pipeline.add(opusparse)

# 链接视频元素
v4l2src.link(video_filter)
video_filter.link(queue1)
queue1.link(video_encoder)
video_encoder.link(queue2)
queue2.link(video_parser)
video_parser.link(queue3)
queue3.link(rtspclientsink)

# 链接音频元素
alsasrc.link(audio_filter)
audio_filter.link(queue4)
queue4.link(opusenc)
opusenc.link(opusparse)
opusparse.link(rtspclientsink)

# 启动管道
pipeline.set_state(Gst.State.PLAYING)

# 等待管道初始化
time.sleep(5)

# 获取 rtpsession0 和 rtpsession1 元素
rtpsession_elements = {
    'audio': pipeline.get_by_name("rtpsession0"),
    'video': pipeline.get_by_name("rtpsession1")
}

for session_name, element in rtpsession_elements.items():
    if element:
        print(f"SignalON {session_name} element", flush=True)
    else:
        print(f"{session_name} element not found", flush=True)

def get_bitrate(struct):
    realtime_bitrate = 0
    if not struct:
        return realtime_bitrate
    for i in range(struct.n_fields()):
        field_name = struct.nth_field_name(i)
        field_value = struct.get_value(field_name)
        if field_name == "source-stats" and isinstance(field_value, list):
            for item in field_value:
                if isinstance(item, Gst.Structure):
                    bitrate = item.get_value("bitrate")
                    if bitrate > realtime_bitrate:
                        realtime_bitrate = bitrate
    return realtime_bitrate

def print_realtime_bitrate(rtpsession, session_name):
    try:
        stats = rtpsession.get_property("stats")
        if stats:
            realtime_bitrate = get_bitrate(stats)
            # print(f"Bitrate for {session_name}: {realtime_bitrate}", flush=True)
        else:
            print(f"Failed to retrieve stats property for {session_name}", flush=True)
    except Exception as e:
        print(f"Error retrieving stats property for {session_name}: {e}", flush=True)

try:
    while True:
        for session_name, rtpsession in rtpsession_elements.items():
            if rtpsession:
                print_realtime_bitrate(rtpsession, session_name)
        time.sleep(3)
except KeyboardInterrupt:
    # 结束时清理
    pipeline.set_state(Gst.State.NULL)
    print("程序已结束", flush=True)
