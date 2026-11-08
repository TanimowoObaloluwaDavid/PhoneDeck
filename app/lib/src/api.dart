import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.message);
  final String message;

  @override
  String toString() => message;
}

class DeviceInfo {
  DeviceInfo({
    required this.serial,
    required this.state,
    this.model,
    this.product,
  });

  factory DeviceInfo.fromJson(Map<String, dynamic> json) => DeviceInfo(
        serial: json['serial'] as String? ?? '',
        state: json['state'] as String? ?? 'unknown',
        model: json['model'] as String?,
        product: json['product'] as String?,
      );

  final String serial;
  final String state;
  final String? model;
  final String? product;

  bool get ready => state == 'device';
  String get title => model ?? product ?? serial;
}

class PhoneNotification {
  PhoneNotification({
    required this.id,
    required this.package,
    required this.title,
    required this.text,
  });

  factory PhoneNotification.fromJson(Map<String, dynamic> json) => PhoneNotification(
        id: json['id'] as String? ?? '',
        package: json['pkg'] as String? ?? '',
        title: json['title'] as String? ?? '',
        text: json['text'] as String? ?? '',
      );

  final String id;
  final String package;
  final String title;
  final String text;
}

class AppEntry {
  AppEntry({required this.package, required this.label});

  factory AppEntry.fromJson(Map<String, dynamic> json) => AppEntry(
        package: json['package'] as String? ?? '',
        label: json['label'] as String? ?? '',
      );

  final String package;
  final String label;
}

class FileEntry {
  FileEntry({required this.name, required this.isDir});

  factory FileEntry.fromJson(Map<String, dynamic> json) => FileEntry(
        name: json['name'] as String? ?? '',
        isDir: json['dir'] as bool? ?? false,
      );

  final String name;
  final bool isDir;
}

class DeviceStats {
  DeviceStats({
    required this.model,
    required this.android,
    required this.width,
    required this.height,
    required this.battery,
  });

  factory DeviceStats.fromJson(Map<String, dynamic> json) => DeviceStats(
        model: json['model'] as String? ?? '',
        android: json['android'] as String? ?? '',
        width: (json['width'] as num?)?.toInt() ?? 0,
        height: (json['height'] as num?)?.toInt() ?? 0,
        battery: (json['battery'] as num?)?.toInt(),
      );

  final String model;
  final String android;
  final int width;
  final int height;
  final int? battery;
}

/// Talks to the local Node engine on 127.0.0.1 only.
class DeckApi {
  DeckApi({http.Client? client}) : _http = client ?? http.Client();

  static const String baseUrl = 'http://127.0.0.1:8787';
  static const String mirrorUrl = '$baseUrl/';

  final http.Client _http;

  Future<Map<String, dynamic>> _get(String path, [Map<String, String>? query]) async {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);
    final response = await _http.get(uri).timeout(const Duration(seconds: 30));
    return _decode(response);
  }

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    final response = await _http
        .post(
          Uri.parse('$baseUrl$path'),
          headers: const {'content-type': 'application/json'},
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 30));
    return _decode(response);
  }

  Map<String, dynamic> _decode(http.Response response) {
    final text = response.body;
    Map<String, dynamic> data = const {};
    if (text.isNotEmpty) {
      final decoded = jsonDecode(text);
      if (decoded is Map<String, dynamic>) data = decoded;
    }
    if (response.statusCode >= 400) {
      throw ApiException(data['error']?.toString() ?? 'Request failed (${response.statusCode})');
    }
    return data;
  }

  Future<bool> healthy() async {
    try {
      final data = await _get('/health');
      return data['ok'] == true;
    } catch (_) {
      return false;
    }
  }

  Future<List<DeviceInfo>> devices() async {
    final data = await _get('/devices');
    final list = data['devices'] as List<dynamic>? ?? const [];
    return list.map((e) => DeviceInfo.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<String>> mdnsServices() async {
    final data = await _get('/mdns');
    final list = data['services'] as List<dynamic>? ?? const [];
    return list
        .map((e) => (e as Map<String, dynamic>)['address']?.toString() ?? '')
        .where((e) => e.isNotEmpty)
        .toList();
  }

  Future<void> pair(String address, String code) => _post('/pair', {
        'address': address,
        'code': code,
      });

  Future<void> connect(String address) => _post('/connect', {'address': address});

  Future<void> disconnect(String address) => _post('/disconnect', {'address': address});

  Future<void> startMirror({
    required String serial,
    int maxSize = 1280,
    int bitRateMbps = 8,
    int maxFps = 60,
  }) =>
      _post('/mirror/start', {
        'serial': serial,
        'maxSize': maxSize,
        'bitRateMbps': bitRateMbps,
        'maxFps': maxFps,
      });

  Future<void> stopMirror() => _post('/mirror/stop', const {});

  Future<List<PhoneNotification>> notifications(String serial) async {
    final data = await _get('/notifications', {'serial': serial});
    final list = data['notifications'] as List<dynamic>? ?? const [];
    return list.map((e) => PhoneNotification.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<AppEntry>> apps(String serial) async {
    final data = await _get('/apps', {'serial': serial});
    final list = data['apps'] as List<dynamic>? ?? const [];
    return list.map((e) => AppEntry.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> launchApp(String serial, String package) =>
      _post('/apps/launch', {'serial': serial, 'package': package});

  Future<List<FileEntry>> files(String serial, String path) async {
    final data = await _get('/files', {'serial': serial, 'path': path});
    final list = data['entries'] as List<dynamic>? ?? const [];
    return list.map((e) => FileEntry.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> keyEvent(String serial, String key) =>
      _post('/keyevent', {'serial': serial, 'key': key});

  Future<void> action(String serial, String name) =>
      _post('/action', {'serial': serial, 'name': name});

  Future<DeviceStats> info(String serial) async {
    final data = await _get('/info', {'serial': serial});
    return DeviceStats.fromJson(data);
  }

  Future<Uint8List> screenshot(String serial) async {
    final uri = Uri.parse('$baseUrl/screenshot').replace(queryParameters: {'serial': serial});
    final response = await _http.get(uri).timeout(const Duration(seconds: 30));
    if (response.statusCode >= 400) throw ApiException('Screenshot failed');
    return response.bodyBytes;
  }
}
