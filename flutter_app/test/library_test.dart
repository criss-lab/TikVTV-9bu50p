import 'package:flutter_test/flutter_test.dart';
import 'package:tikvtv/src/catalogue.dart';
import 'package:tikvtv/src/library.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('catalogue and library share singleton instances', () {
    expect(identical(ChannelCatalogue(), ChannelCatalogue()), isTrue);
    expect(identical(ChannelLibrary(), ChannelLibrary()), isTrue);
  });
  test('favorites persist and toggle without duplicate IDs', () async {
    SharedPreferences.setMockInitialValues({});
    final library = ChannelLibrary();
    await library.load();
    await library.toggleFavorite('example.tv');
    expect(library.isFavorite('example.tv'), isTrue);
    await library.toggleFavorite('example.tv');
    expect(library.isFavorite('example.tv'), isFalse);
  });
}
