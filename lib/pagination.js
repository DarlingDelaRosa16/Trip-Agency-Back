module.exports = (result, pagination) => ({
  items: result.rows, total: result.count, page: pagination.page, pageSize: pagination.pageSize
});
