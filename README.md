# vietnam-administrative-address

Thư viện npm chuyển đổi địa chỉ hành chính Việt Nam từ dữ liệu cũ sang dữ liệu mới sau sáp nhập. Package chạy offline, dữ liệu mapping được đóng gói sẵn và không cần gọi API bên ngoài.

## Tính năng

- Convert địa chỉ cũ sang địa chỉ mới theo tên đã chuẩn hóa.
- Convert từ một chuỗi địa chỉ đầy đủ có số nhà/đường sang địa chỉ hành chính mới, dù đầu vào là địa chỉ cũ hay địa chỉ mới.
- Hỗ trợ tên có dấu, không dấu, có hoặc không có tiền tố hành chính.
- Hỗ trợ truyền thêm mã tỉnh, huyện, xã cũ để thu hẹp hoặc kiểm tra kết quả.
- Xử lý trường hợp một địa chỉ cũ map ra nhiều địa chỉ mới bằng options.
- Export dữ liệu hành chính cũ, dữ liệu hành chính mới và mapping để dùng offline.

## Cài đặt

Yêu cầu Node.js 16 trở lên.

```bash
npm install vietnam-administrative-address
```

## Sử dụng nhanh

```js
import { convertOldToNew } from "vietnam-administrative-address";

const result = convertOldToNew(
  {
    province_name: "TP Hồ Chí Minh",
    district_name: "Quận 1",
    ward_name: "Phường Bến Nghé",
  },
  {
    multiple: "all",
  },
);

console.log(result.status);
console.log(result.result);
console.log(result.candidates);
```

Convert từ một chuỗi địa chỉ đầy đủ:

```js
import { convertAddressText } from "vietnam-administrative-address";

const result = convertAddressText(
  "123 Lê Lợi, Phường Đa Kao, Quận 1, TP Hồ Chí Minh",
  { multiple: "first" },
);

console.log(result.remaining_text); // 123 Lê Lợi
console.log(result.converted_text); // 123 Lê Lợi, Phường Tân Định, Thành phố Hồ Chí Minh
console.log(result.parsed); // input hành chính cũ đã parse được
```

## API

### convertOldToNew(input, options)

Convert một địa chỉ hành chính cũ sang địa chỉ hành chính mới.

```js
import { convertOldToNew } from "vietnam-administrative-address";

const result = convertOldToNew(input, options);
```

`input` hỗ trợ các trường sau:

```js
{
  province_name: '...',
  district_name: '...',
  ward_name: '...',
  province_code: '...',
  district_code: '...',
  ward_code: '...'
}
```

Trong đó:

- `province_name`: tên tỉnh/thành phố cũ.
- `district_name`: tên quận/huyện/thị xã/thành phố thuộc tỉnh cũ.
- `ward_name`: tên phường/xã/thị trấn cũ.
- `province_code`: mã tỉnh/thành phố cũ, dùng để thu hẹp hoặc validate.
- `district_code`: mã quận/huyện cũ, dùng để thu hẹp hoặc validate.
- `ward_code`: mã phường/xã cũ, dùng để thu hẹp hoặc validate.

Converter ưu tiên match theo tên đã normalize. Nếu truyền thêm code, code sẽ được dùng để lọc candidates hoặc kiểm tra mismatch khi bật `strict`.

### Options

```js
convertOldToNew(input, {
  multiple: "all",
  strict: false,
  allowBroadMatch: false,
});
```

| Option            | Giá trị                | Mặc định | Mô tả                                                             |
| ----------------- | ---------------------- | -------- | ----------------------------------------------------------------- |
| `multiple`        | `'all'` hoặc `'first'` | `'all'`  | Cách xử lý khi có nhiều kết quả hợp lệ.                           |
| `strict`          | `true` hoặc `false`    | `false`  | Nếu `true`, mismatch giữa tên/code/parent sẽ trả `invalid_input`. |
| `allowBroadMatch` | `true` hoặc `false`    | `false`  | Nếu `true`, cho phép match rộng chỉ theo tên phường/xã.           |

### convertAddressText(text, options)

Convert một chuỗi địa chỉ sang địa chỉ hành chính mới. Đầu vào có thể là địa chỉ cũ hoặc địa chỉ mới; hàm sẽ giữ lại phần không thuộc hành chính trong `remaining_text` và trả địa chỉ mới ở `converted_text`.

```js
import { convertAddressText } from "vietnam-administrative-address";

const oldAddressResult = convertAddressText(
  "123 Lê Lợi, Phường Đa Kao, Quận 1, TP Hồ Chí Minh",
  { multiple: "all" },
);

const newAddressResult = convertAddressText(
  "123 Lê Lợi, Phường Tân Định, Thành phố Hồ Chí Minh",
  { multiple: "all" },
);
```

Response có dạng:

```js
{
  text: '123 Lê Lợi, Phường Đa Kao, Quận 1, TP Hồ Chí Minh',
  input_type: 'old',
  parsed: {
    province_name: 'Thành Phố Hồ Chí Minh',
    district_name: 'Quận 1',
    ward_name: 'Phường Đa Kao',
    province_code: '12',
    district_code: '268',
    ward_code: '65804'
  },
  remaining_text: '123 Lê Lợi',
  converted_text: '123 Lê Lợi, Phường Tân Định, Thành phố Hồ Chí Minh',
  match_level: 'province_district_ward_name',
  conversion: {},
  warnings: []
}
```

`input_type` là `'old'` khi parse được địa chỉ cũ và convert qua mapping, là `'new'` khi input đã là địa chỉ mới.

`options` được truyền tiếp sang `convertOldToNew` khi input là địa chỉ cũ. Nếu muốn tách options của parser và converter, có thể truyền `convertOptions`:

```js
convertAddressText(addressText, {
  convertOptions: {
    multiple: "first",
    strict: true,
  },
});
```

### createConverter(data)

Tạo converter riêng với bộ dữ liệu custom.

```js
import { createConverter, defaultData } from "vietnam-administrative-address";

const converter = createConverter(defaultData);
const result = converter.convertOldToNew({
  province_name: "Hà Nội",
  district_name: "Ba Đình",
  ward_name: "Điện Biên",
});
```

### normalizeVietnameseName(value)

Chuẩn hóa tên tiếng Việt để so sánh.

```js
import { normalizeVietnameseName } from "vietnam-administrative-address";

console.log(normalizeVietnameseName("Phường Bến Nghé"));
// ben nghe
```

Hàm normalize sẽ:

- Chuyển chữ về lowercase.
- Bỏ dấu tiếng Việt.
- Chuyển `đ` thành `d`.
- Bỏ các tiền tố hành chính phổ biến như `Tỉnh`, `Thành phố`, `Quận`, `Huyện`, `Phường`, `Xã`, `Thị trấn`.
- Gom khoảng trắng và bỏ ký tự phân tách thừa.

## Response

`convertOldToNew` trả về object có dạng:

```js
{
  status: 'matched',
  match_level: 'province_district_ward_name',
  input: {},
  old: {
    province: {},
    district: {},
    ward: {}
  },
  result: {
    new_province: {},
    new_ward: {},
    mapping: {
      row_indexes: [0]
    }
  },
  candidates: [],
  warnings: []
}
```

### status

| Status          | Mô tả                                                                     |
| --------------- | ------------------------------------------------------------------------- |
| `matched`       | Tìm thấy một kết quả, hoặc chọn bản ghi đầu tiên với `multiple: 'first'`. |
| `ambiguous`     | Có nhiều kết quả hợp lệ và `multiple: 'all'`.                             |
| `not_found`     | Không tìm thấy mapping phù hợp.                                           |
| `invalid_input` | Input thiếu dữ liệu tối thiểu hoặc mismatch khi bật `strict`.             |

### multiple: 'all'

Khi có nhiều kết quả hợp lệ, converter trả toàn bộ trong `candidates` và `status` là `ambiguous`.

```js
const result = convertOldToNew(input, {
  multiple: "all",
});

console.log(result.status); // ambiguous
console.log(result.candidates); // toàn bộ kết quả hợp lệ
```

### multiple: 'first'

Khi có nhiều kết quả hợp lệ, converter chọn bản ghi đầu tiên theo thứ tự ổn định trong mapping.

```js
const result = convertOldToNew(input, {
  multiple: "first",
});

console.log(result.status); // matched
console.log(result.result); // kết quả đầu tiên
console.log(result.warnings);
```

## Export dữ liệu

Package export sẵn dữ liệu để dùng offline:

```js
import {
  mapping,
  newProvinces,
  newWards,
  oldProvinces,
  oldDistricts,
  oldWards,
  defaultData,
} from "vietnam-administrative-address";
```

Các export dữ liệu gồm:

- `mapping`: dữ liệu mapping địa chỉ cũ sang mới.
- `newProvinces`: danh sách tỉnh/thành phố mới.
- `newWards`: danh sách xã/phường/thị trấn mới.
- `oldProvinces`: danh sách tỉnh/thành phố cũ.
- `oldDistricts`: danh sách quận/huyện/thị xã cũ.
- `oldWards`: danh sách xã/phường/thị trấn cũ.
- `defaultData`: object gom tất cả dữ liệu trên.

Có thể import trực tiếp từng entry point:

```js
import { mapping } from "vietnam-administrative-address/data";
import { normalizeVietnameseName } from "vietnam-administrative-address/normalize";
```

## Dữ liệu mapping

Mapping runtime nằm trong `data/old_to_new.json`, được sinh từ file Excel nguồn trong thư mục `admin_mapping`.

Để sinh lại mapping:

```bash
npm run generate:mapping
```

Để kiểm tra dữ liệu và converter:

```bash
npm run verify
```

Script verify kiểm tra:

- Tính tồn tại của mã tỉnh/xã mới.
- Quan hệ parent giữa xã mới và tỉnh mới.
- Một số case convert theo tên có dấu, không dấu và prefix hành chính.
- Convert từ chuỗi địa chỉ đầy đủ có phần số nhà/đường.
- Cách xử lý mapping một-nhiều với `multiple: 'all'` và `multiple: 'first'`.

## Lưu ý khi match

- Nên truyền đủ `province_name`, `district_name` và `ward_name` để có kết quả chính xác nhất.
- Nếu có mã cũ, nên truyền thêm `province_code`, `district_code` hoặc `ward_code` để thu hẹp kết quả.
- Chỉ truyền `ward_name` có thể gây trùng tên trên toàn quốc, nên mặc định không match rộng nếu chưa bật `allowBroadMatch`.
- Với địa chỉ cũ, `convertAddressText` chính xác nhất khi text có đủ phường/xã, quận/huyện và tỉnh/thành phố; với địa chỉ mới, text nên có đủ phường/xã và tỉnh/thành phố. Phần số nhà/đường phía trước sẽ nằm trong `remaining_text`.
- Với dữ liệu migration lớn, nên dùng `multiple: 'all'` để tự xử lý các trường hợp một địa chỉ cũ có nhiều kết quả mới.
